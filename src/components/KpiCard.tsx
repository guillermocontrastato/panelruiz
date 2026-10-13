import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Clock, Hash, Sparkles, Loader2, X, BarChart3, RefreshCw, History } from 'lucide-react';
import type { CustomField, Formula, KpiWithDetails } from '@/types';
import { KpiHistory } from '@/components/KpiHistory';
import { fetchCustomFieldsByArea, fetchFormulas, fetchDataEntries, type AsofixMetric } from '@/lib/api';
import { formatValue } from '@/lib/kpi-helpers';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useAsofix } from '@/lib/asofix-context';

const COLOR_MAP: Record<string, { bg: string; border: string; icon: string; label: string; value: string }> = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-300', icon: 'text-emerald-500', label: 'text-emerald-800', value: 'text-emerald-700' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-300', icon: 'text-blue-500', label: 'text-blue-800', value: 'text-blue-700' },
  red: { bg: 'bg-red-50', border: 'border-red-300', icon: 'text-red-500', label: 'text-red-800', value: 'text-red-700' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-300', icon: 'text-amber-500', label: 'text-amber-800', value: 'text-amber-700' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-300', icon: 'text-violet-500', label: 'text-violet-800', value: 'text-violet-700' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-300', icon: 'text-cyan-500', label: 'text-cyan-800', value: 'text-cyan-700' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-300', icon: 'text-rose-500', label: 'text-rose-800', value: 'text-rose-700' },
  slate: { bg: 'bg-slate-50', border: 'border-slate-300', icon: 'text-slate-500', label: 'text-slate-800', value: 'text-slate-700' },
};

function getColorClasses(color: string) {
  return COLOR_MAP[color] ?? COLOR_MAP.emerald;
}

const ASOFIX_KPI_NAME = 'Conversión de leads y efectividad por canal y punto de venta';
const ASOFIX_METRIC_ORDER = [
  'leads_nuevos',
  'cierres_exitosos',
  'leads_en_gestion',
  'cierres_perdidos',
  'conversion_mes_anterior',
  'tiempo_primer_contacto',
];

interface KpiCardProps {
  kpi: KpiWithDetails;
}

export function KpiCard({ kpi }: KpiCardProps) {
  const { session } = useAuth();
  const { data: asofixKpiData, loading: asofixSyncing, error: asofixError, load: loadAsofix, refresh: refreshAsofix } = useAsofix();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, number | null>>({});
  const [historicalResults, setHistoricalResults] = useState<Record<string, number | null>>({});
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [asofixMetrics, setAsofixMetrics] = useState<AsofixMetric[]>([]);
  const [asofixSyncedAt, setAsofixSyncedAt] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const MAX_FIELDS_COLLAPSED = 4;

  const loadCardData = useCallback(async (showLoader = false) => {
    if (showLoader) setRefreshing(true);
    try {
      const [loadedFields, loadedFormulas, history] = await Promise.all([
        fetchCustomFieldsByArea(kpi.area_id),
        fetchFormulas(kpi.id),
        fetchDataEntries(kpi.id),
      ]);

      const kpiFields = loadedFields.filter((f) => !f.kpi_id || f.kpi_id === kpi.id);
      setFields(kpiFields);
      setFormulas(loadedFormulas);

      const latestEntry = history[0];
      if (!latestEntry) {
        setFieldValues({});
        setHistoricalResults({});
        return;
      }

      const inputValues: Record<string, number | null> = {};
      for (const field of kpiFields) {
        if (field.field_role !== 'input') continue;
        inputValues[field.id] = latestEntry.inputs_json?.[field.id]?.value ?? null;
      }
      const resultValues: Record<string, number | null> = {};
      for (const field of kpiFields) {
        if (field.field_role !== 'result') continue;
        resultValues[field.id] = latestEntry.results_json?.[field.id]?.value ?? null;
      }
      setFieldValues(inputValues);
      setHistoricalResults(resultValues);
    } catch {
      setFields([]);
      setFormulas([]);
      setFieldValues({});
      setHistoricalResults({});
    } finally {
      if (showLoader) setRefreshing(false);
    }
  }, [kpi.area_id, kpi.id]);

  useEffect(() => {
    void loadCardData();
  }, [loadCardData]);

  useEffect(() => {
    if (kpi.name !== ASOFIX_KPI_NAME || !session?.access_token) return;
    void loadAsofix();
  }, [kpi.name, session?.access_token, loadAsofix]);

  useEffect(() => {
    if (!asofixKpiData) return;
    const syncedAt = new Date().toISOString();
    setAsofixMetrics(asofixKpiData.metrics.map((metric) => ({ ...metric, synced_at: syncedAt })));
    setAsofixSyncedAt(syncedAt);
  }, [asofixKpiData]);

  const visibleFields = useMemo(() => {
    return fields
      .filter((field) => !field.hidden_in_dashboard)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [fields]);

  const shownFields = expanded ? visibleFields : visibleFields.slice(0, MAX_FIELDS_COLLAPSED);
  const hasMore = visibleFields.length > MAX_FIELDS_COLLAPSED;

  const handleAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const historyEntries = [...await fetchDataEntries(kpi.id)].sort((a, b) =>
        b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at),
      );
      const latestEntry = historyEntries[0];
      const previousEntry = historyEntries[1];
      const history = historyEntries.map((entry) => ({
        entry_date: entry.entry_date,
        value: entry.value,
        created_at: entry.created_at,
        user: entry.profiles?.full_name ?? entry.profiles?.email ?? 'Usuario',
        inputs: entry.inputs_json,
        results: entry.results_json,
      }));
      const fieldSummary = visibleFields.map((f) => ({
        label: f.label,
        name: f.name,
        field_role: f.field_role,
        unit: f.unit ?? '',
        value: f.field_role === 'input'
          ? latestEntry?.inputs_json?.[f.id]?.value ?? null
          : latestEntry?.results_json?.[f.id]?.value ?? null,
      }));
      const formulaSummary = formulas.map((fm) => ({
        name: fm.name,
        expression: fm.expression,
      }));
      const { data, error } = await supabase.functions.invoke('analyze-kpi', {
        body: {
          kpi: {
            name: kpi.name,
            definition: kpi.definition,
            unit: kpi.unit,
            target_direction: kpi.target_direction,
            data: latestEntry && kpi.data ? {
              current_value: latestEntry.value,
              target_value: kpi.data.target_value,
              previous_value: previousEntry?.value ?? latestEntry.value,
              trend: previousEntry
                ? latestEntry.value > previousEntry.value ? 'up' : latestEntry.value < previousEntry.value ? 'down' : 'stable'
                : 'stable',
            } : undefined,
          },
          fields: fieldSummary,
          formulas: formulaSummary,
          history,
        },
      });
      if (error) throw error;
      setAnalysis((data as { suggestions: string }).suggestions);
    } catch {
      setAnalysis('No se pudo generar el análisis en este momento. Intentá nuevamente más tarde.');
    }
    setAnalyzing(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-lg hover:border-gray-300 transition-all duration-300">
      <div className="mb-4 flex flex-col gap-3">
        <div className="min-w-0 w-full pr-0">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug break-words">{kpi.name}</h3>
          {kpi.definition && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed break-words">{kpi.definition}</p>
          )}
          {kpi.data?.updated_at && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-1">
              <Clock className="w-3 h-3" />
              <span>Actualizado: {new Date(kpi.data.updated_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-start gap-1.5 flex-wrap">
          <button
            onClick={() => void loadCardData(true)}
            disabled={refreshing}
            title="Actualizar valores"
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowHistory(true)}
            title="Historial de cargas"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">Historial</span>
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            title="Analizar con IA"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 hover:border-violet-300 transition-colors disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-medium">IA</span>
          </button>
        </div>
      </div>

      {visibleFields.length > 0 ? (
        <div className="space-y-1.5">
          {shownFields.map((field) => {
            const c = getColorClasses(field.color);
            const isInput = field.field_role === 'input';
            const value = isInput
              ? fieldValues[field.id] ?? null
              : historicalResults[field.id] ?? null;
            const Icon = isInput ? Hash : Calculator;
            return (
              <div key={field.id} className={`${c.bg} border ${c.border} rounded-lg px-2.5 py-1.5`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3 h-3 ${c.icon} flex-shrink-0`} />
                    <p className={`text-[11px] font-semibold ${c.label} leading-snug line-clamp-2`}>{field.label}</p>
                  </div>
                  <p className={`text-sm font-bold ${c.value} leading-tight flex-shrink-0`}>
                    {value != null && !isNaN(value) ? formatValue(value, field.unit ?? '%') : '—'}
                  </p>
                </div>
              </div>
            );
          })}
          {hasMore && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full text-center text-[11px] font-medium text-blue-600 hover:text-blue-700 py-1 transition-colors"
            >
              {expanded ? 'Ver menos' : `Ver más (${visibleFields.length - MAX_FIELDS_COLLAPSED} adicionales)`}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No hay campos configurados para mostrar.</p>
      )}

      {kpi.name === ASOFIX_KPI_NAME && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-cyan-600" />
              <p className="text-[11px] font-semibold text-slate-700">
                Datos de Asófix
                {asofixSyncedAt && (
                  <span className="text-slate-400 font-normal ml-1">
                    · {new Date(asofixSyncedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => void refreshAsofix()}
              disabled={asofixSyncing}
              title="Actualizar datos de Asófix"
              className="p-1 rounded-md text-cyan-500 hover:text-cyan-700 hover:bg-cyan-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${asofixSyncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {asofixError && (
            <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">{asofixError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ASOFIX_METRIC_ORDER.map((key) => {
              const metric = asofixMetrics.find((m) => m.metric_key === key);
              return (
                <div key={key} className="flex items-center justify-between gap-2 rounded-lg bg-cyan-50 border border-cyan-200 px-2.5 py-1.5">
                  <p className="text-[10px] font-medium text-cyan-900 leading-snug">
                    {metric?.label ?? key}
                  </p>
                  <p className="text-xs font-bold text-cyan-700 whitespace-nowrap">
                    {metric?.value ?? '—'}
                  </p>
                </div>
              );
            })}
          </div>
          {asofixKpiData && asofixKpiData.breakdowns.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-cyan-200">
              <table className="w-full text-[10px]">
                <thead className="bg-cyan-50 text-cyan-900">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">Canal</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Punto de venta</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Leads</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Cierres</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Conversión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-100 bg-white">
                  {asofixKpiData.breakdowns.map((row, index) => (
                    <tr key={`${row.channel}-${row.pointOfSale}-${index}`}>
                      <td className="px-2 py-1.5 text-cyan-950">{row.channel}</td>
                      <td className="px-2 py-1.5 text-cyan-950">{row.pointOfSale}</td>
                      <td className="px-2 py-1.5 text-right text-cyan-800">{row.leads}</td>
                      <td className="px-2 py-1.5 text-right text-cyan-800">{row.successful}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-cyan-700">{row.conversion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showHistory && (
        <KpiHistory
          kpiId={kpi.id}
          areaId={kpi.area_id}
          kpiName={kpi.name}
          onClose={() => setShowHistory(false)}
        />
      )}

      {analysis && (
        <div className="mt-3 bg-violet-50 border border-violet-200 rounded-xl p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
              <p className="text-[11px] font-semibold text-violet-800">Sugerencias de la IA</p>
            </div>
            <button onClick={() => setAnalysis(null)} className="p-0.5 rounded text-violet-400 hover:text-violet-700 hover:bg-violet-100 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="text-[11px] text-violet-700 leading-relaxed whitespace-pre-line">{analysis}</div>
        </div>
      )}
    </div>
  );
}
