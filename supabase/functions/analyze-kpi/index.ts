import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnalyzeHistoryEntry {
  entry_date: string;
  value: number;
  created_at: string;
  user: string;
  inputs: Record<string, { label: string; value: number }> | null;
  results: Record<string, { label: string; value: number }> | null;
}

interface AnalyzeRequest {
  kpi: {
    name: string;
    definition: string;
    unit: string;
    target_direction: string;
    data?: {
      current_value: number;
      target_value: number;
      previous_value: number;
      trend: string;
    };
  };
  fields: Array<{
    label: string;
    name: string;
    field_role: string;
    unit: string;
    value: number | null;
  }>;
  formulas: Array<{
    name: string;
    expression: string;
  }>;
  history: AnalyzeHistoryEntry[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: AnalyzeRequest = await req.json();

    // Build a compact text summary of the KPI for the LLM
    const kpi = body.kpi;
    const lines: string[] = [];
    lines.push(`Indicador: ${kpi.name}`);
    if (kpi.definition) lines.push(`Definición: ${kpi.definition}`);
    lines.push(`Unidad: ${kpi.unit}`);
    lines.push(`Dirección objetivo: ${kpi.target_direction === 'up' ? 'mayor es mejor' : 'menor es mejor'}`);

    if (kpi.data) {
      lines.push(`Valor actual vigente del historial: ${kpi.data.current_value} ${kpi.unit}`);
      lines.push(`Valor anterior vigente del historial: ${kpi.data.previous_value} ${kpi.unit}`);
      lines.push(`Objetivo propuesto por administración: ${kpi.data.target_value} ${kpi.unit}`);
      lines.push(`Tendencia calculada solo con el historial vigente: ${kpi.data.trend}`);
    }

    if (body.fields && body.fields.length > 0) {
      lines.push("");
      lines.push("Campos:");
      for (const f of body.fields) {
        const valStr = f.value != null ? `${f.value} ${f.unit ?? ''}`.trim() : 'sin datos';
        lines.push(`  - ${f.label} (${f.field_role}): ${valStr}`);
      }
    }

    if (body.formulas && body.formulas.length > 0) {
      lines.push("");
      lines.push("Fórmulas:");
      for (const fm of body.formulas) {
        lines.push(`  - ${fm.name}: ${fm.expression}`);
      }
    }

    lines.push("");
    lines.push(`Historial vigente completo (${body.history.length} registros; solo estos datos deben considerarse):`);
    if (body.history.length === 0) {
      lines.push("  - Sin registros históricos.");
    } else {
      for (const entry of body.history) {
        const inputs = formatEntryValues(entry.inputs);
        const results = formatEntryValues(entry.results);
        lines.push(`  - ${entry.entry_date}: valor=${entry.value} ${kpi.unit}; entradas=[${inputs}]; resultados=[${results}]; cargado por=${entry.user}`);
      }
    }

    const summary = lines.join("\n");

    const prompt = `Sos un consultor experto en gestión de KPIs. Analizá el valor actual, la meta u objetivo propuesto por el administrador o gerente, los valores cargados por los operadores y todo el historial. Compará la brecha contra la meta, la evolución entre períodos, los resultados de las fórmulas y las entradas que explican cada resultado. Entregá 3 a 5 sugerencias concretas y accionables. Si no hay historial o meta, indicá esa limitación. Respondé en español, en formato de lista breve, sin introducción.

${summary}`;

    // Fetch API keys from the api_connections table
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: connections } = await supabase
      .from("api_connections")
      .select("name, api_key, base_url, auth_config")
      .eq("is_active", true)
      .order("created_at");

    const openaiConn = connections?.find((c: { name: string }) => c.name.toLowerCase().includes("openai"));
    const geminiConn = connections?.find((c: { name: string }) => c.name.toLowerCase().includes("gemini"));

    let suggestions: string | null = null;

    // Try OpenAI first
    if (openaiConn?.api_key) {
      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiConn.api_key}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Sos un asistente experto en análisis de KPIs empresariales. Respondé en español." },
              { role: "user", content: prompt },
            ],
            max_tokens: 600,
            temperature: 0.7,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          suggestions = data.choices?.[0]?.message?.content ?? null;
        }
      } catch { /* fall through to Gemini */ }
    }

    // Try Gemini as fallback
    if (!suggestions && geminiConn?.api_key) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiConn.api_key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
            }),
          },
        );

        if (resp.ok) {
          const data = await resp.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) suggestions = text;
        }
      } catch { /* fall through to heuristic */ }
    }

    // Heuristic fallback
    if (!suggestions) {
      suggestions = generateHeuristicAnalysis(kpi, body.fields, body.history);
    }

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function generateHeuristicAnalysis(
  kpi: AnalyzeRequest["kpi"],
  fields: AnalyzeRequest["fields"],
  history: AnalyzeHistoryEntry[],
): string {
  const tips: string[] = [];

  if (kpi.data) {
    const { current_value, target_value, previous_value, trend } = kpi.data;
    const isUp = kpi.target_direction === "up";

    if (isUp ? current_value < target_value : current_value > target_value) {
      tips.push(`El valor actual (${current_value}) está por ${isUp ? 'debajo' : 'por encima'} del objetivo (${target_value}). Hay una brecha de ${Math.abs(current_value - target_value).toFixed(1)} ${kpi.unit}.`);
    } else {
      tips.push(`El valor actual (${current_value}) cumple el objetivo (${target_value}). Considerá ajustar la meta hacia arriba para mantener el desafío.`);
    }

    if (trend === "up") {
      tips.push(isUp
        ? "La tendencia es ascendente, lo cual es positiva. Mantené las acciones actuales y buscá replicarlas en otros indicadores."
        : "La tendencia es ascendente pero el objetivo es reducirla. Revisá los procesos que están generando el aumento.");
    } else if (trend === "down") {
      tips.push(isUp
        ? "La tendencia es descendente. Identificá los factores que están impactando negativamente y priorizá acciones correctivas."
        : "La tendencia es descendente, lo cual es positiva. Documentá las buenas prácticas que están funcionando.");
    } else {
      tips.push("La tendencia es estable. Evaluá si el estancamiento es aceptable o si necesitás nuevas iniciativas para mover la aguja.");
    }

    const change = previous_value !== 0 ? ((current_value - previous_value) / Math.abs(previous_value)) * 100 : 0;
    if (Math.abs(change) > 0) {
      tips.push(`Cambio respecto al período anterior: ${change > 0 ? '+' : ''}${change.toFixed(1)}%.`);
    }
  }

  if (history.length > 0) {
    const latest = history[0];
    const oldest = history[history.length - 1];
    if (latest.value !== oldest.value) {
      tips.push(`El historial muestra un cambio de ${oldest.value} a ${latest.value} ${kpi.unit}. Revisá qué entradas del operador explican esa variación y replicá las prácticas que mejoraron el resultado.`);
    }
  } else {
    tips.push("Todavía no hay historial de cargas para identificar patrones entre períodos.");
  }

  const nullFields = fields.filter((f) => f.value == null);
  if (nullFields.length > 0) {
    tips.push(`Hay ${nullFields.length} campo(s) sin datos cargados (${nullFields.map((f) => f.label).join(", ")}). Completarlos permitirá un análisis más preciso.`);
  }

  if (tips.length === 0) {
    tips.push("No hay datos suficientes para un análisis detallado. Cargá datos regularmente para obtener mejores sugerencias.");
  }

  return tips.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

function formatEntryValues(values: Record<string, { label: string; value: number }> | null): string {
  if (!values) return "sin datos";
  return Object.values(values).map((item) => `${item.label}=${item.value}`).join(", ") || "sin datos";
}
