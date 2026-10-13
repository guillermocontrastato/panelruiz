import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  totalRows: number;
  jobComplete: boolean;
}

interface TableMetadata {
  datasetId: string;
  tableId: string;
  fields: string[];
}

interface AsofixKpiData {
  metrics: { metric_key: string; label: string; value: string }[];
  breakdowns: { channel: string; pointOfSale: string; leads: number; successful: number; conversion: string }[];
  source: string;
}

async function getGoogleAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedJwt = `${enc(header)}.${enc(payload)}`;

  const privateKeyPem = (sa.private_key || "").replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
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
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedJwt),
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
    throw new Error(`Error al obtener token de Google (${tokenResp.status}): ${errText.substring(0, 300)}`);
  }

  const tokenData = await tokenResp.json();
  return tokenData.access_token;
}

async function runBigQueryQuery(
  accessToken: string,
  projectId: string,
  sql: string,
  maxResults: number,
): Promise<QueryResult> {
  const body = {
    query: sql,
    maxResults,
    useLegacySql: false,
  };

  const resp = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );

  const data = await resp.json();

  if (!resp.ok) {
    const message = data?.error?.message || `BigQuery respondió ${resp.status}`;
    throw new Error(message);
  }

  const schemaFields = data?.schema?.fields || [];
  const columns = schemaFields.map((f: { name: string }) => f.name);
  const rawRows = data?.rows || [];

  const rows = rawRows.map((row: { f: { v: unknown }[] }) =>
    row.f.map((cell) => {
      if (cell.v == null) return null;
      const v = typeof cell.v === "object" && cell.v !== null ? (cell.v as { value?: unknown }).value ?? cell.v : cell.v;
      return v;
    }),
  );

  return {
    columns,
    rows,
    totalRows: data?.totalRows ?? rows.length,
    jobComplete: data?.jobComplete ?? false,
  };
}

async function listDatasets(accessToken: string, projectId: string): Promise<string[]> {
  const resp = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  const datasets = data?.datasets || [];
  return datasets.map((d: { datasetReference: { datasetId: string } }) => d.datasetReference?.datasetId).filter(Boolean);
}

async function listTables(accessToken: string, projectId: string, datasetId: string): Promise<string[]> {
  const resp = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  const tables = data?.tables || [];
  return tables.map((t: { tableReference: { tableId: string } }) => t.tableReference?.tableId).filter(Boolean);
}

async function getTableMetadata(accessToken: string, projectId: string, datasetId: string, tableId: string): Promise<TableMetadata | null> {
  const resp = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${encodeURIComponent(datasetId)}/tables/${encodeURIComponent(tableId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  const fields = (data?.schema?.fields || []).map((field: { name?: string }) => field.name).filter(Boolean);
  return { datasetId, tableId, fields };
}

function findField(fields: string[], patterns: RegExp[]): string | null {
  return fields.find((field) => patterns.some((pattern) => pattern.test(field))) ?? null;
}

function quoteIdentifier(identifier: string): string {
  return "`" + identifier.replace(/`/g, "") + "`";
}

async function findLeadsTable(accessToken: string, projectId: string): Promise<{ table: TableMetadata; channel: string; pointOfSale: string; status: string; date: string | null } | null> {
  const datasets = await listDatasets(accessToken, projectId);
  const candidates: Array<{ table: TableMetadata; score: number; channel: string | null; pointOfSale: string | null; status: string | null; date: string | null }> = [];

  for (const datasetId of datasets) {
    const tables = await listTables(accessToken, projectId, datasetId);
    for (const tableId of tables.slice(0, 100)) {
      const table = await getTableMetadata(accessToken, projectId, datasetId, tableId);
      if (!table) continue;
      const channel = findField(table.fields, [/^canal$/i, /channel/i, /origen/i, /fuente/i, /source/i]);
      const pointOfSale = findField(table.fields, [/punto.?venta/i, /sucursal/i, /concesionaria/i, /dealer/i, /branch/i]);
      const status = findField(table.fields, [/^estado$/i, /status/i, /resultado/i, /etapa/i, /stage/i]);
      const leadId = findField(table.fields, [/lead/i, /oportunidad/i, /prospect/i, /cliente/i]);
      const date = findField(table.fields, [/fecha.*crea/i, /created/i, /fecha.*alta/i, /^fecha$/i, /date/i]);
      const score = (channel ? 3 : 0) + (pointOfSale ? 3 : 0) + (status ? 3 : 0) + (leadId ? 2 : 0) + (date ? 1 : 0);
      if (score >= 8 && channel && pointOfSale && status) candidates.push({ table, score, channel, pointOfSale, status, date });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || !best.channel || !best.pointOfSale || !best.status) return null;
  return { table: best.table, channel: best.channel, pointOfSale: best.pointOfSale, status: best.status, date: best.date };
}

async function getAsofixKpiData(accessToken: string, projectId: string): Promise<AsofixKpiData> {
  const match = await findLeadsTable(accessToken, projectId);
  if (!match) throw new Error('No se encontró una tabla de leads con campos de canal, punto de venta y estado.');

  const tableName = `${projectId}.${match.table.datasetId}.${match.table.tableId}`;
  const table = quoteIdentifier(tableName);
  const channel = quoteIdentifier(match.channel);
  const pointOfSale = quoteIdentifier(match.pointOfSale);
  const status = quoteIdentifier(match.status);
  const dateFilter = match.date ? `WHERE DATE(${quoteIdentifier(match.date)}) >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)` : '';
  const success = `REGEXP_CONTAINS(LOWER(CAST(${status} AS STRING)), r'vend|venta|cerr|gan|exitos')`;
  const loss = `REGEXP_CONTAINS(LOWER(CAST(${status} AS STRING)), r'perd|rechaz|caid|desist|no interes')`;
  const sql = `SELECT CAST(${channel} AS STRING) AS channel, CAST(${pointOfSale} AS STRING) AS point_of_sale, COUNT(*) AS leads, COUNTIF(${success}) AS successful, COUNTIF(${loss}) AS lost FROM ${table} ${dateFilter} GROUP BY 1, 2 ORDER BY leads DESC LIMIT 200`;
  const result = await runBigQueryQuery(accessToken, projectId, sql, 200);
  const breakdowns = result.rows.map((row) => {
    const leads = Number(row[2] ?? 0);
    const successful = Number(row[3] ?? 0);
    return { channel: String(row[0] ?? 'Sin canal'), pointOfSale: String(row[1] ?? 'Sin punto de venta'), leads, successful, conversion: `${leads ? ((successful / leads) * 100).toFixed(2).replace('.', ',') : '0,00'}%` };
  });
  const leads = breakdowns.reduce((sum, row) => sum + row.leads, 0);
  const successful = breakdowns.reduce((sum, row) => sum + row.successful, 0);
  const lost = await runBigQueryQuery(accessToken, projectId, `SELECT COUNTIF(${loss}) AS lost FROM ${table} ${dateFilter}`, 1);
  const lostCount = Number(lost.rows[0]?.[0] ?? 0);
  const managed = Math.max(leads - successful - lostCount, 0);
  const conversion = leads ? `${((successful / leads) * 100).toFixed(2).replace('.', ',')}%` : '0,00%';

  return {
    metrics: [
      { metric_key: 'leads_nuevos', label: 'Cantidad de leads nuevos', value: String(leads) },
      { metric_key: 'cierres_exitosos', label: 'Cantidad de cierres exitosos', value: String(successful) },
      { metric_key: 'leads_en_gestion', label: 'Leads en gestión', value: String(managed) },
      { metric_key: 'cierres_perdidos', label: 'Cantidad de cierres perdidos', value: String(lostCount) },
      { metric_key: 'conversion_mes_anterior', label: 'Tasa de conversión', value: conversion },
      { metric_key: 'tiempo_primer_contacto', label: 'Período consultado', value: match.date ? 'Últimos 12 meses' : 'Histórico' },
    ],
    breakdowns,
    source: tableName,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
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

    const { data: connData } = await supabase
      .from("api_connections")
      .select("auth_config")
      .ilike("name", "%Asófix%")
      .maybeSingle();

    if (!connData) {
      return new Response(JSON.stringify({ error: "No se encontró la conexión de Asófix Producción." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sa = connData.auth_config;
    if (!sa?.type || sa.type !== "service_account" || !sa.private_key || !sa.client_email) {
      return new Response(JSON.stringify({ error: "La conexión de Asófix no tiene credenciales de Service Account válidas." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getGoogleAccessToken(sa);
    const projectId = sa.project_id || "asofix-produccion";

    if (action === "get_kpi_data") {
      const kpiData = await getAsofixKpiData(accessToken, projectId);
      return new Response(JSON.stringify({ data: kpiData }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_datasets") {
      const datasets = await listDatasets(accessToken, projectId);
      return new Response(JSON.stringify({ datasets }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_tables") {
      const datasetId = body.datasetId;
      if (!datasetId) {
        return new Response(JSON.stringify({ error: "Falta el datasetId." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const tables = await listTables(accessToken, projectId, datasetId);
      return new Response(JSON.stringify({ tables }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "query") {
      const sql = body.sql;
      if (!sql || typeof sql !== "string") {
        return new Response(JSON.stringify({ error: "Falta la consulta SQL." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const normalizedSql = sql.trim().replace(/^\s*--[^\n]*(\n|$)/g, '').trim();
      if (!/^(select|with)\b/i.test(normalizedSql) || /\b(insert|update|delete|merge|alter|drop|create|truncate|grant|revoke|call)\b/i.test(normalizedSql)) {
        return new Response(JSON.stringify({ error: "Solo se permiten consultas de lectura (SELECT)." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const maxResults = Math.min(Math.max(Math.floor(body.maxResults ?? 100), 1), 1000);
      const result = await runBigQueryQuery(accessToken, projectId, sql.trim(), maxResults);
      return new Response(JSON.stringify({ result }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acción no válida. Usá: list_datasets, list_tables o query." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
