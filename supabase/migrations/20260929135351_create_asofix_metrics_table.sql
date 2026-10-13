/*
# Create asofix_metrics table

## Overview
Stores the six management metrics synced from Asófix Producción (Google Service Account).
Each row is one metric (identified by `metric_key`) with its current value and the timestamp
of the last sync. The frontend reads these rows to display live data in the
"Conversión de leads y efectividad por canal y punto de venta" KPI card.

## New Tables
- `asofix_metrics`
  - `id` (uuid, primary key)
  - `metric_key` (text, unique) — machine-readable key (e.g. "leads_nuevos")
  - `label` (text) — human-readable label shown in the UI
  - `value` (text) — the value as displayed by Asófix (may include %, "hs", etc.)
  - `synced_at` (timestamptz) — when the value was last fetched from Asófix

## Security
- RLS enabled
- All authenticated users can read (dashboard is shared across roles)
- Only admin/gerente can write (sync is triggered server-side via edge function
  using the service role key, which bypasses RLS)
*/

CREATE TABLE IF NOT EXISTS asofix_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text UNIQUE NOT NULL,
  label text NOT NULL,
  value text NOT NULL DEFAULT '',
  synced_at timestamptz DEFAULT now()
);

ALTER TABLE asofix_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_asofix_metrics" ON asofix_metrics;
CREATE POLICY "auth_select_asofix_metrics" ON asofix_metrics FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_asofix_metrics" ON asofix_metrics;
CREATE POLICY "admin_insert_asofix_metrics" ON asofix_metrics FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente'))
  );

DROP POLICY IF EXISTS "admin_update_asofix_metrics" ON asofix_metrics;
CREATE POLICY "admin_update_asofix_metrics" ON asofix_metrics FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente'))
  );

-- Seed initial values so the card shows data before the first sync
INSERT INTO asofix_metrics (metric_key, label, value) VALUES
  ('leads_nuevos',           'Cantidad de leads nuevos',           '722'),
  ('cierres_exitosos',       'Cantidad de cierres exitosos',       '46'),
  ('leads_en_gestion',       'Leads en gestión',                   '202'),
  ('cierres_perdidos',       'Cantidad de cierres perdidos',       '638'),
  ('conversion_mes_anterior','Tasa de conversión del mes anterior', '5,99%'),
  ('tiempo_primer_contacto', 'Tiempo promedio del primer contacto', '05:43 hs')
ON CONFLICT (metric_key) DO NOTHING;
