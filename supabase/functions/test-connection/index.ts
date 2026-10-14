import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ParsedLead {
  id?: string;
  name?: string;
  nombre?: string;
  email?: string;
  correo?: string;
  phone?: string;
  telefono?: string;
  celular?: string;
  vehicle_interest?: string;
  vehiculo?: string;
  modelo?: string;
  status?: string;
  estado?: string;
  source?: string;
  origen?: string;
  notes?: string;
  observaciones?: string;
}

function normalizeLeadStatus(status?: string): string {
  if (!status) return "nuevo";
  const value = status.toLowerCase();
  if (/nuevo|new/i.test(value)) return "nuevo";
  if (/contact|segu/i.test(value)) return "contactado";
  if (/calif|qualif/i.test(value)) return "calificado";
  if (/descart|perd|lost/i.test(value)) return "descartado";
  if (/vend|closed|gan/i.test(value)) return "vendido";
  return "nuevo";
}

function parseGribaMarkdown(markdown: string): ParsedLead[] {
  const lines = markdown.split("\n").map((line) => line.trim()).filter(Boolean);
  const tableLines = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (tableLines.length < 3) return [];

  const headers = tableLines[0].split("|").slice(1, -1).map((cell) => cell.trim().toLowerCase());
  const leads: ParsedLead[] = [];
  for (const line of tableLines.slice(2)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (!cells.length || cells.every((cell) => /^[-: ]+$/.test(cell))) continue;
    const lead: ParsedLead = { source: "Griba" };
    cells.forEach((cell, index) => {
      const header = headers[index] || "";
      if (/nombre|cliente|prospect/i.test(header)) lead.name = cell;
      else if (/email|correo|mail/i.test(header)) lead.email = cell;
      else if (/tel|fono|celular|contacto/i.test(header)) lead.phone = cell;
      else if (/veh|modelo|auto|inter/i.test(header)) lead.vehicle_interest = cell;
      else if (/estad|status/i.test(header)) lead.status = cell;
      else if (/origen|fuente|source/i.test(header)) lead.source = cell;
      else if (/obs|notas/i.test(header)) lead.notes = cell;
      else if (/id|codigo|cod/i.test(header)) lead.id = cell;
    });
    lead.status = normalizeLeadStatus(lead.status);
    if (lead.name || lead.email || lead.phone || lead.vehicle_interest) leads.push(lead);
  }
  return leads;
}

function parseGribaMarkdownStructured(markdown: string): ParsedLead[] {
  const leads: ParsedLead[] = [];
  const blocks = markdown.split(/\n#{2,}\s|\n---\s|\n\*\*\*\s/);
  for (const block of blocks) {
    const text = block.trim();
    if (text.length < 10) continue;
    const lead: ParsedLead = { source: "Griba", status: "nuevo" };
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) lead.email = emailMatch[0];
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
    if (phoneMatch) lead.phone = phoneMatch[0];
    const nameMatch = text.match(/(?:nombre|cliente|prospecto)\s*[:-]?\s*([^,\n|]{3,50})/i);
    if (nameMatch) lead.name = nameMatch[1].trim();
    const vehMatch = text.match(/(?:veh[ií]culo|modelo|auto|inter[eé]s)\s*[:-]?\s*([^,\n|]{3,50})/i);
    if (vehMatch) lead.vehicle_interest = vehMatch[1].trim();
    const statusMatch = text.match(/(?:estado|status)\s*[:-]?\s*(\w+)/i);
    if (statusMatch) lead.status = normalizeLeadStatus(statusMatch[1]);
    if (!lead.name) {
      const firstLine = text.split("\n")[0].trim().replace(/^[#*\-|]+\s*/, "");
      if (firstLine.length >= 3 && firstLine.length <= 60) lead.name = firstLine;
    }
    if (lead.name || lead.email || lead.phone) leads.push(lead);
  }
  return leads;
}

function parseGribaDivCards(html: string): ParsedLead[] {
  const leads: ParsedLead[] = [];
  const cardRegex = /<(?:div|li|tr)[^>]*class="[^"]*(?:card|item|row|oportunidad|prospect|lead|grid-item|data-row)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|tr)>/gi;
  const cardMatches = [...html.matchAll(cardRegex)];
  for (const card of cardMatches) {
    const cardHtml = card[1];
    const text = cardHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text.length < 5) continue;
    const lead: ParsedLead = { source: "Griba", status: "nuevo" };
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) lead.email = emailMatch[0];
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
    if (phoneMatch) lead.phone = phoneMatch[0];
    const nameMatch = text.match(/(?:nombre|cliente|prospecto)\s*[:-]?\s*([^,\n|]{3,50})/i);
    if (nameMatch) lead.name = nameMatch[1].trim();
    const vehMatch = text.match(/(?:veh[ií]culo|modelo|auto|inter[eé]s)\s*[:-]?\s*([^,\n|]{3,50})/i);
    if (vehMatch) lead.vehicle_interest = vehMatch[1].trim();
    const statusMatch = text.match(/(?:estado|status)\s*[:-]?\s*(\w+)/i);
    if (statusMatch) lead.status = normalizeLeadStatus(statusMatch[1]);
    if (!lead.name) {
      const firstLine = text.split(/[|,\n]/)[0].trim();
      if (firstLine.length >= 3 && firstLine.length <= 60) lead.name = firstLine;
    }
    if (lead.name || lead.email || lead.phone) leads.push(lead);
  }
  return leads;
}

function parseSingleHtmlTable(tableHtml: string): ParsedLead[] {
  const leads: ParsedLead[] = [];

  const headerRowMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const headerCells: string[] = [];
  if (headerRowMatch) {
    const thMatches = headerRowMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi);
    for (const m of thMatches) {
      headerCells.push(m[1].replace(/<[^>]*>/g, "").trim().toLowerCase());
    }
  }

  const bodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const rowsHtml = bodyMatch ? bodyMatch[1] : tableHtml;

  const rowMatches = rowsHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const rowMatch of rowMatches) {
    const cellMatches = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (cellMatches.length === 0) continue;

    const cells = cellMatches.map((m) => m[1].replace(/<[^>]*>/g, "").trim());
    if (cells.every((c) => c === "")) continue;

    const lead: ParsedLead = {};

    if (headerCells.length >= cells.length) {
      cells.forEach((cell, i) => {
        const header = headerCells[i] || "";
        if (/nombre|cliente|prospect/i.test(header)) lead.name = cell;
        else if (/email|correo|mail/i.test(header)) lead.email = cell;
        else if (/tel|fono|celular|contacto/i.test(header)) lead.phone = cell;
        else if (/veh|modelo|auto|inter/i.test(header)) lead.vehicle_interest = cell;
        else if (/estad|status/i.test(header)) lead.status = cell;
        else if (/origen|fuente|source/i.test(header)) lead.source = cell;
        else if (/obs|notas/i.test(header)) lead.notes = cell;
        else if (/id|codigo|cod/i.test(header)) lead.id = cell;
      });
    } else {
      lead.name = cells[0] || "";
      if (cells.length > 1) lead.phone = cells[1] || "";
      if (cells.length > 2) lead.email = cells[2] || "";
      if (cells.length > 3) lead.vehicle_interest = cells[3] || "";
      if (cells.length > 4) lead.status = cells[4] || "";
    }

    lead.status = normalizeLeadStatus(lead.status);
    if (!lead.source) lead.source = "Griba";
    leads.push(lead);
  }

  return leads;
}

function parseGribaHtmlTable(html: string): ParsedLead[] {
  const allLeads: ParsedLead[] = [];
  const tableMatches = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tableMatches.length === 0) return allLeads;
  for (const tableMatch of tableMatches) {
    const tableLeads = parseSingleHtmlTable(tableMatch[1]);
    if (tableLeads.length > 0) allLeads.push(...tableLeads);
  }
  return allLeads;
}

function parseGribaJsonData(html: string): ParsedLead[] {
  const leads: ParsedLead[] = [];
  const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scriptMatches) {
    const scriptContent = script[1];
    const jsonMatches = [...scriptContent.matchAll(/\[\s*\{[\s\S]*?\}\s*\]/g)];
    for (const jsonMatch of jsonMatches) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (typeof item !== "object" || item === null) continue;
        const lead: ParsedLead = { source: "Griba", status: "nuevo" };
        const keys = Object.keys(item);
        for (const key of keys) {
          const lowerKey = key.toLowerCase();
          const value = String(item[key] ?? "");
          if (/nombre|cliente|prospect/i.test(lowerKey)) lead.name = value;
          else if (/email|correo|mail/i.test(lowerKey)) lead.email = value;
          else if (/tel|fono|celular|contacto/i.test(lowerKey)) lead.phone = value;
          else if (/veh|modelo|auto|inter/i.test(lowerKey)) lead.vehicle_interest = value;
          else if (/estad|status/i.test(lowerKey)) lead.status = value;
          else if (/origen|fuente|source/i.test(lowerKey)) lead.source = value;
          else if (/obs|notas/i.test(lowerKey)) lead.notes = value;
          else if (/^id$|codigo|cod/i.test(lowerKey)) lead.id = value;
        }
        lead.status = normalizeLeadStatus(lead.status);
        if (lead.name || lead.email || lead.phone || lead.vehicle_interest) leads.push(lead);
      }
    } catch { /* not valid JSON, skip */ }
    }
  }
  return leads;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!callerProfile || (callerProfile.role !== "admin" && callerProfile.role !== "gerente")) {
      return new Response(JSON.stringify({ error: "No tenés permisos para realizar esta acción" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action;

    // === TEST API CONNECTION ===
    if (action === "test_api") {
      const { base_url, auth_type, auth_config } = body;

      // Detect Google Service Account
      const isServiceAccount = auth_config?.type === "service_account" && auth_config?.private_key && auth_config?.client_email;

      if (isServiceAccount) {
        try {
          const sa = auth_config;
          const scopes = sa.scope || "https://www.googleapis.com/auth/cloud-platform";
          const tokenUrl = sa.token_uri || "https://oauth2.googleapis.com/token";

          // Build JWT
          const now = Math.floor(Date.now() / 1000);
          const header = { alg: "RS256", typ: "JWT" };
          const payload = {
            iss: sa.client_email,
            scope: scopes,
            aud: tokenUrl,
            iat: now,
            exp: now + 3600,
          };

          const enc = (obj: object) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
          const unsignedJwt = `${enc(header)}.${enc(payload)}`;

          // Import the private key
          const privateKeyPem = sa.private_key.replace(/\\n/g, "\n");
          const keyB64 = privateKeyPem
            .replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replace(/\s/g, "");
          const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
          const cryptoKey = await crypto.subtle.importKey(
            "pkcs8",
            keyBytes,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["sign"]
          );

          const signature = await crypto.subtle.sign(
            "RSASSA-PKCS1-v1_5",
            cryptoKey,
            new TextEncoder().encode(unsignedJwt)
          );
          const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
          const jwt = `${unsignedJwt}.${sigB64}`;

          // Exchange JWT for access token
          const tokenResp = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
          });

          if (!tokenResp.ok) {
            const errText = await tokenResp.text();
            return new Response(JSON.stringify({
              success: false,
              message: `Error al obtener token de Google (${tokenResp.status}): ${errText.substring(0, 200)}`,
            }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const tokenData = await tokenResp.json();
          const accessToken = tokenData.access_token;

          // Test a real Google API endpoint
          const testUrl = base_url.endsWith("/") ? base_url.slice(0, -1) : base_url;
          const testResp = await fetch(`${testUrl}/oauth2/v1/userinfo`, {
            headers: { "Authorization": `Bearer ${accessToken}` },
          });

          return new Response(JSON.stringify({
            success: testResp.ok || testResp.status === 401,
            status: testResp.status,
            message: tokenResp.ok
              ? `Token de Google obtenido correctamente. Cuenta: ${sa.client_email}`
              : `Token obtenido pero el endpoint de prueba respondió ${testResp.status}`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (err) {
          return new Response(JSON.stringify({
            success: false,
            message: `Error con cuenta de servicio: ${err instanceof Error ? err.message : "Error desconocido"}`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const configuredKey = auth_config?.api_key || body.api_key;
      const normalizedBaseUrl = String(base_url || "").replace(/\/$/, "");
      const isOpenAI = /(^|\.)api\.openai\.com$/i.test(new URL(normalizedBaseUrl).hostname);
      const isGemini = /(^|\.)generativelanguage\.googleapis\.com$/i.test(new URL(normalizedBaseUrl).hostname);

      if (isOpenAI) {
        headers["Authorization"] = `Bearer ${configuredKey || auth_config?.token || ""}`;
      } else if (isGemini) {
        headers["x-goog-api-key"] = configuredKey || auth_config?.token || "";
      } else if (auth_type === "bearer" && auth_config?.token) {
        headers["Authorization"] = `Bearer ${auth_config.token}`;
      } else if (auth_type === "api_key" && configuredKey) {
        headers[auth_config.header_name || "X-API-Key"] = configuredKey;
      } else if (auth_type === "basic" && auth_config?.username) {
        const encoded = btoa(`${auth_config.username}:${auth_config.password || ""}`);
        headers["Authorization"] = `Basic ${encoded}`;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        let testUrl = normalizedBaseUrl;
        if (isOpenAI) {
          testUrl = `${new URL(normalizedBaseUrl).origin}/v1/models`;
        } else if (isGemini) {
          testUrl = `${new URL(normalizedBaseUrl).origin}/v1beta/models`;
        }
        const response = await fetch(testUrl, { headers, signal: controller.signal });
        clearTimeout(timeoutId);

        return new Response(JSON.stringify({
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          message: response.ok ? "Conexión exitosa" : `El servidor respondió ${response.status}`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          message: err instanceof Error ? err.message : "Error de conexión",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // === TEST FIRECRAWL CONNECTION ===
    if (action === "test_firecrawl") {
      const { target_url, credentials } = body;
      const apiKey = credentials?.api_key;

      if (!apiKey) {
        return new Response(JSON.stringify({
          success: false,
          message: "Falta la API Key de Firecrawl",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ url: target_url, formats: ["markdown"] }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = await response.json();
        return new Response(JSON.stringify({
          success: response.ok,
          status: response.status,
          message: response.ok ? "Conexión exitosa con Firecrawl" : data.error || `Error ${response.status}`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          message: err instanceof Error ? err.message : "Error de conexión",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // === CRAWL GRIBA SITE WITH FIRECRAWL ===
    if (action === "crawl_griba_firecrawl") {
      const { target_url, api_key, auth_type, auth_config } = body;
      if (!api_key) {
        return new Response(JSON.stringify({ success: false, message: "Falta la API Key de Firecrawl." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sourceHeaders: Record<string, string> = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; RuizAutomotoresDashboard/1.0)",
      };
      if (auth_type === "bearer" && auth_config?.token) {
        sourceHeaders["Authorization"] = `Bearer ${auth_config.token}`;
      } else if (auth_type === "api_key" && auth_config?.api_key) {
        sourceHeaders[auth_config.header_name || "X-API-Key"] = auth_config.api_key;
      } else if (auth_type === "basic" && auth_config?.username) {
        sourceHeaders["Authorization"] = `Basic ${btoa(`${auth_config.username}:${auth_config.password || ""}`)}`;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);
        const response = await fetch("https://api.firecrawl.dev/v2/crawl", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${api_key}`,
          },
          body: JSON.stringify({
            url: target_url,
            limit: 50,
            scrapeOptions: {
              formats: ["markdown"],
              onlyMainContent: true,
              waitFor: 5000,
              headers: sourceHeaders,
            },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const result = await response.json();
        if (!response.ok) {
          return new Response(JSON.stringify({
            success: false,
            message: result?.error || `Firecrawl respondió con error ${response.status}.`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const crawlId = result?.id;
        if (!crawlId) {
          return new Response(JSON.stringify({
            success: false,
            message: "Firecrawl no devolvió un ID de crawl.",
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        let status = result?.status || "scraping";
        let crawlData = result;
        let attempts = 0;
        while (status !== "completed" && attempts < 20) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          const pollResponse = await fetch(`https://api.firecrawl.dev/v2/crawl/${crawlId}`, {
            headers: { "Authorization": `Bearer ${api_key}` },
          });
          crawlData = await pollResponse.json();
          status = crawlData?.status || "scraping";
          attempts++;
        }

        const pages = crawlData?.data || [];
        const sections = pages.map((page: { url?: string; markdown?: string; title?: string }, i: number) => {
          const pageUrl = page.url || "";
          const pageTitle = page.title || pageUrl.split("/").pop() || `Página ${i + 1}`;
          const markdown = page.markdown || "";
          const tableCount = (markdown.match(/\|.*\|/g) || []).length;
          const hasData = markdown.length > 100;
          return {
            id: `page_${i}`,
            title: pageTitle,
            url: pageUrl,
            preview: markdown.substring(0, 300).replace(/\s+/g, " ").trim(),
            dataCount: tableCount,
            hasData,
            markdown,
          };
        }).filter((s: { hasData: boolean }) => s.hasData);

        if (sections.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            message: "Firecrawl recorrió el sitio pero no encontró páginas con datos. El CRM puede requerir una sesión iniciada.",
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ success: true, sections }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          message: err instanceof Error ? `No se pudo recorrer el sitio con Firecrawl: ${err.message}` : "No se pudo recorrer el sitio con Firecrawl.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // === SCRAPE A SPECIFIC GRIBA PAGE WITH FIRECRAWL ===
    if (action === "scrape_griba_page") {
      const { target_url, api_key, auth_type, auth_config } = body;
      if (!api_key) {
        return new Response(JSON.stringify({ success: false, message: "Falta la API Key de Firecrawl." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sourceHeaders: Record<string, string> = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; RuizAutomotoresDashboard/1.0)",
      };
      if (auth_type === "bearer" && auth_config?.token) {
        sourceHeaders["Authorization"] = `Bearer ${auth_config.token}`;
      } else if (auth_type === "api_key" && auth_config?.api_key) {
        sourceHeaders[auth_config.header_name || "X-API-Key"] = auth_config.api_key;
      } else if (auth_type === "basic" && auth_config?.username) {
        sourceHeaders["Authorization"] = `Basic ${btoa(`${auth_config.username}:${auth_config.password || ""}`)}`;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${api_key}`,
          },
          body: JSON.stringify({
            url: target_url,
            formats: ["html", "markdown"],
            onlyMainContent: false,
            waitFor: 8000,
            headers: sourceHeaders,
            actions: [
              { type: "wait", selector: "table, .table, .grid, .list, .data-grid", timeout: 10000 },
              { type: "scroll" },
              { type: "wait", milliseconds: 3000 },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const result = await response.json();
        if (!response.ok || !result?.success) {
          return new Response(JSON.stringify({
            success: false,
            message: result?.error || `Firecrawl respondió con error ${response.status}.`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const html = result.data?.html || "";
        const markdown = result.data?.markdown || "";
        const metadata = result.data?.metadata || {};
        const title = metadata.title || "";

        const tableLeads = parseGribaHtmlTable(html);
        const jsonLeads = parseGribaJsonData(html);
        const markdownTableLeads = parseGribaMarkdown(markdown);
        const divCardLeads = parseGribaDivCards(html);
        const markdownStructuredLeads = parseGribaMarkdownStructured(markdown);

        const parsedLeads = tableLeads.length > 0 ? tableLeads
          : jsonLeads.length > 0 ? jsonLeads
          : markdownTableLeads.length > 0 ? markdownTableLeads
          : divCardLeads.length > 0 ? divCardLeads
          : markdownStructuredLeads;

        if (parsedLeads.length === 0) {
          const isLoginPage = /login|iniciar sesi|contrase|password|sign in|log in/i.test(markdown) || /login|iniciar sesi|contrase|password/i.test(html.substring(0, 2000));
          const contentPreview = (markdown || html).substring(0, 500).replace(/\s+/g, " ").trim();
          const tableCount = (html.match(/<table/gi) || []).length;
          const scriptCount = (html.match(/<script/gi) || []).length;
          return new Response(JSON.stringify({
            success: false,
            message: isLoginPage
              ? `Firecrawl abrió la página pero parece ser una página de login (título: "${title}"). El CRM requiere una sesión iniciada con cookies. Las credenciales basic auth no son suficientes para este tipo de CRM.`
              : `Firecrawl abrió la página (título: "${title}") pero no encontró oportunidades. Se encontraron ${tableCount} tablas y ${scriptCount} scripts en el HTML. Primeros 500 caracteres del contenido: ${contentPreview}`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ success: true, leads: parsedLeads, count: parsedLeads.length, title }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          message: err instanceof Error ? `No se pudo recorrer la página con Firecrawl: ${err.message}` : "No se pudo recorrer la página con Firecrawl.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // === FETCH GRIBA LEADS THROUGH FIRECRAWL ===
    if (action === "fetch_griba_firecrawl") {
      const { target_url, api_key, auth_type, auth_config } = body;
      if (!api_key) {
        return new Response(JSON.stringify({ success: false, message: "Falta la API Key de Firecrawl." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sourceHeaders: Record<string, string> = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; RuizAutomotoresDashboard/1.0)",
      };
      if (auth_type === "bearer" && auth_config?.token) {
        sourceHeaders["Authorization"] = `Bearer ${auth_config.token}`;
      } else if (auth_type === "api_key" && auth_config?.api_key) {
        sourceHeaders[auth_config.header_name || "X-API-Key"] = auth_config.api_key;
      } else if (auth_type === "basic" && auth_config?.username) {
        sourceHeaders["Authorization"] = `Basic ${btoa(`${auth_config.username}:${auth_config.password || ""}`)}`;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${api_key}`,
          },
          body: JSON.stringify({
            url: target_url,
            formats: ["html", "markdown"],
            onlyMainContent: false,
            waitFor: 8000,
            headers: sourceHeaders,
            actions: [
              { type: "wait", selector: "table, .table, .grid, .list, .data-grid", timeout: 10000 },
              { type: "scroll" },
              { type: "wait", milliseconds: 3000 },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const result = await response.json();
        if (!response.ok || !result?.success) {
          return new Response(JSON.stringify({
            success: false,
            message: result?.error || `Firecrawl respondió con error ${response.status}.`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const html = result.data?.html || "";
        const markdown = result.data?.markdown || "";
        const metadata = result.data?.metadata || {};
        const title = metadata.title || "";

        const tableLeads = parseGribaHtmlTable(html);
        const jsonLeads = parseGribaJsonData(html);
        const markdownTableLeads = parseGribaMarkdown(markdown);
        const divCardLeads = parseGribaDivCards(html);
        const markdownStructuredLeads = parseGribaMarkdownStructured(markdown);

        const parsedLeads = tableLeads.length > 0 ? tableLeads
          : jsonLeads.length > 0 ? jsonLeads
          : markdownTableLeads.length > 0 ? markdownTableLeads
          : divCardLeads.length > 0 ? divCardLeads
          : markdownStructuredLeads;

        if (parsedLeads.length === 0) {
          const isLoginPage = /login|iniciar sesi|contrase|password|sign in|log in/i.test(markdown) || /login|iniciar sesi|contrase|password/i.test(html.substring(0, 2000));
          const contentPreview = (markdown || html).substring(0, 500).replace(/\s+/g, " ").trim();
          const tableCount = (html.match(/<table/gi) || []).length;
          const scriptCount = (html.match(/<script/gi) || []).length;
          return new Response(JSON.stringify({
            success: false,
            message: isLoginPage
              ? `Firecrawl abrió la página pero parece ser una página de login (título: "${title}"). El CRM requiere una sesión iniciada con cookies. Las credenciales basic auth no son suficientes para este tipo de CRM.`
              : `Firecrawl abrió la página (título: "${title}") pero no encontró oportunidades. Se encontraron ${tableCount} tablas y ${scriptCount} scripts en el HTML. La página puede cargar los datos dinámicamente con JavaScript o requerir sesión iniciada. Primeros 500 caracteres del contenido: ${contentPreview}`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ success: true, leads: parsedLeads, count: parsedLeads.length }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          message: err instanceof Error ? `No se pudo recorrer la página con Firecrawl: ${err.message}` : "No se pudo recorrer la página con Firecrawl.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // === FETCH GRIBA LEADS (HTML scraping) ===
    if (action === "fetch_griba") {
      const { base_url, auth_type, auth_config, endpoint } = body;
      const cleanBase = base_url.replace(/\/+$/, "");
      const cleanEndpoint = (endpoint || "/Oportunidad_ListView").replace(/^\/+/, "");
      const fetchUrl = `${cleanBase}/${cleanEndpoint}`;

      const headers: Record<string, string> = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; RuizAutomotoresDashboard/1.0)",
      };
      if (auth_type === "bearer" && auth_config?.token) {
        headers["Authorization"] = `Bearer ${auth_config.token}`;
      } else if (auth_type === "api_key" && auth_config?.api_key) {
        headers[auth_config.header_name || "X-API-Key"] = auth_config.api_key;
      } else if (auth_type === "basic" && auth_config?.username) {
        const encoded = btoa(`${auth_config.username}:${auth_config.password || ""}`);
        headers["Authorization"] = `Basic ${encoded}`;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        const response = await fetch(fetchUrl, { headers, signal: controller.signal, redirect: "follow" });
        clearTimeout(timeoutId);

        if (!response.ok) {
          let errDetail = "";
          try {
            const errText = await response.text();
            errDetail = errText.substring(0, 300);
          } catch { /* ignore */ }
          return new Response(JSON.stringify({
            success: false,
            message: `Error ${response.status} al conectar con ${fetchUrl}. ${errDetail ? `Respuesta: ${errDetail}` : ""}`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const html = await response.text();

        // Check if it's a login page
        if (html.length < 500 && /login|iniciar sesi|contrase|password/i.test(html)) {
          return new Response(JSON.stringify({
            success: false,
            message: "El servidor redirigió a una página de login. Verificá que las credenciales (usuario y contraseña) en la conexión API sean correctas.",
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Parse HTML table to extract leads
        const leads = parseGribaHtmlTable(html);

        if (leads.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            message: `Se conectó a ${fetchUrl} pero no se encontraron oportunidades en la página. Es posible que la tabla tenga una estructura diferente o que no haya datos para mostrar.`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({
          success: true,
          leads,
          count: leads.length,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al conectar con Griba";
        return new Response(JSON.stringify({
          success: false,
          message: `No se pudo conectar a ${fetchUrl}. ${msg}`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // === SYNC ASOFIX METRICS ===
    if (action === "sync_asofix") {
      const { data: connData } = await supabase
        .from("api_connections")
        .select("base_url, auth_type, auth_config")
        .ilike("name", "%Asófix%")
        .maybeSingle();

      if (!connData) {
        return new Response(JSON.stringify({
          success: false,
          message: "No se encontró la conexión de Asófix Producción.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const sa = connData.auth_config;
      const isServiceAccount = sa?.type === "service_account" && sa?.private_key && sa?.client_email;

      if (!isServiceAccount) {
        return new Response(JSON.stringify({
          success: false,
          message: "La conexión de Asófix no tiene credenciales de Service Account válidas.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        // 1. Get Google OAuth access token via JWT
        const now = Math.floor(Date.now() / 1000);
        const header = { alg: "RS256", typ: "JWT" };
        const payload = {
          iss: sa.client_email,
          scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly",
          aud: sa.token_uri || "https://oauth2.googleapis.com/token",
          iat: now,
          exp: now + 3600,
        };

        const enc = (obj: object) =>
          btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
        const unsignedJwt = `${enc(header)}.${enc(payload)}`;

        const privateKeyPem = sa.private_key.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
        const keyB64 = privateKeyPem
          .replace("-----BEGIN PRIVATE KEY-----", "")
          .replace("-----END PRIVATE KEY-----", "")
          .replace(/\s/g, "");
        const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
        const cryptoKey = await crypto.subtle.importKey(
          "pkcs8",
          keyBytes,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["sign"]
        );

        const signature = await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          cryptoKey,
          new TextEncoder().encode(unsignedJwt)
        );
        const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
          .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
        const jwt = `${unsignedJwt}.${sigB64}`;

        const tokenResp = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
        });

        if (!tokenResp.ok) {
          const errText = await tokenResp.text();
          return new Response(JSON.stringify({
            success: false,
            message: `Error al obtener token de Google (${tokenResp.status}): ${errText.substring(0, 300)}`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        // 2. List spreadsheets in Google Drive to find the Asófix spreadsheet
        const driveResp = await fetch(
          "https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27&orderBy=modifiedTime+desc&pageSize=20",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!driveResp.ok) {
          const errText = await driveResp.text();
          const message = driveResp.status === 403
            ? "Google Drive API está deshabilitada en el proyecto asofix-produccion. Habilitala en Google Cloud Console y volvé a cargar el dashboard."
            : `Error al listar archivos de Google Drive (${driveResp.status}): ${errText.substring(0, 300)}`;
          return new Response(JSON.stringify({
            success: false,
            message,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const driveData = await driveResp.json();
        const files = driveData.files || [];

        if (files.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            message: "La cuenta de servicio no tiene acceso a ninguna hoja de cálculo. Compartí la hoja de Asófix con el email: " + sa.client_email,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Find a spreadsheet that looks like Asófix / producción / Ruiz
        const target = files.find((f: { name: string }) =>
          /as[oó]fix|producci[oó]n|ruiz/i.test(f.name)
        ) || files[0];

        // 3. Fetch spreadsheet values using the lightweight values.get API
        // First get spreadsheet metadata to find sheet names
        const metaResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${target.id}?fields=sheets.properties.title`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!metaResp.ok) {
          const errText = await metaResp.text();
          return new Response(JSON.stringify({
            success: false,
            message: `Error al leer metadata de la hoja (${metaResp.status}): ${errText.substring(0, 300)}`,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const metaData = await metaResp.json();
        const sheetTitles: string[] = (metaData.sheets || []).map((s: { properties: { title: string } }) => s.properties?.title).filter(Boolean);

        // 4. Fetch values from all sheets (lightweight API)
        const metricLabels: Record<string, string> = {
          leads_nuevos: "leads nuevos",
          cierres_exitosos: "cierres exitosos",
          leads_en_gestion: "leads en gesti[oó]n",
          cierres_perdidos: "cierres perdidos",
          conversion_mes_anterior: "conversi[oó]n del mes anterior",
          tiempo_primer_contacto: "tiempo promedio del primer contacto|primer contacto",
        };

        const foundValues: Record<string, string> = {};

        for (const sheetTitle of sheetTitles) {
          if (Object.keys(foundValues).length >= 6) break;
          const rangeResp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${target.id}/values/${encodeURIComponent(sheetTitle)}!A1:Z200`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!rangeResp.ok) continue;
          const rangeData = await rangeResp.json();
          const rows: string[][] = rangeData.values || [];

          for (const row of rows) {
            for (let ci = 0; ci < row.length; ci++) {
              const cellText = (row[ci] || "").toString().toLowerCase();
              if (!cellText) continue;
              for (const [key, pattern] of Object.entries(metricLabels)) {
                if (new RegExp(pattern, "i").test(cellText) && !foundValues[key]) {
                  // Value is in the next cell
                  const nextVal = row[ci + 1];
                  if (nextVal != null && nextVal !== "") {
                    foundValues[key] = String(nextVal);
                  }
                }
              }
            }
          }
        }

        // 5. Update the asofix_metrics table with found values
        const labelMap: Record<string, string> = {
          leads_nuevos: "Cantidad de leads nuevos",
          cierres_exitosos: "Cantidad de cierres exitosos",
          leads_en_gestion: "Leads en gestión",
          cierres_perdidos: "Cantidad de cierres perdidos",
          conversion_mes_anterior: "Tasa de conversión del mes anterior",
          tiempo_primer_contacto: "Tiempo promedio del primer contacto",
        };

        let updated = 0;
        for (const [key, value] of Object.entries(foundValues)) {
          if (!value) continue;
          const { error: upsertError } = await supabase
            .from("asofix_metrics")
            .upsert({
              metric_key: key,
              label: labelMap[key],
              value: value,
              synced_at: new Date().toISOString(),
            }, { onConflict: "metric_key" });
          if (!upsertError) updated++;
        }

        return new Response(JSON.stringify({
          success: true,
          updated,
          message: `Sincronización completada. ${updated} métricas actualizadas desde "${target.name}".`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          message: `Error al sincronizar con Asófix: ${err instanceof Error ? err.message : "Error desconocido"}`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
