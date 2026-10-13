import { useEffect, useMemo, useState } from 'react';
import { History, X, Calendar, Loader2, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchEntryDatesByKpi, fetchDataEntries, fetchCustomFieldsByArea, fetchFieldValuesByDate, fetchFormulas } from '@/lib/api';
import { parseFormula } from '@/lib/formula-parser';
import { formatValue } from '@/lib/kpi-helpers';
import type { CustomField, DataEntryWithProfile, FieldValue, Formula } from '@/types';

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

interface KpiHistoryProps {
  kpiId: string;
  areaId: string;
  kpiName: string;
  onClose: () => void;
}

export function KpiHistory({ kpiId, areaId, kpiName, onClose }: KpiHistoryProps) {
  const [dates, setDates] = useState<string[]>([]);
  const [entries, setEntries] = useState<DataEntryWithProfile[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadingValues, setLoadingValues] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [entryDates, loadedEntries, loadedFields, loadedFormulas] = await Promise.all([
          fetchEntryDatesByKpi(kpiId),
          fetchDataEntries(kpiId),
          fetchCustomFieldsByArea(areaId),
          fetchFormulas(kpiId),
        ]);
        if (cancelled) return;
        const kpiFields = loadedFields.filter((f) => !f.kpi_id || f.kpi_id === kpiId);
        setDates(entryDates);
        setEntries(loadedEntries);
        setFields(kpiFields);
        setFormulas(loadedFormulas);
        if (entryDates.length > 0) {
          setSelectedDate(entryDates[0]);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [kpiId, areaId]);

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    (async () => {
      setLoadingValues(true);
      try {
        const inputFieldIds = fields
          .filter((f) => f.field_role === 'input')
          .map((f) => f.id);
        if (inputFieldIds.length === 0) {
          if (!cancelled) setFieldValues({});
          return;
        }
        const values = await fetchFieldValuesByDate(inputFieldIds, selectedDate);
        if (cancelled) return;
        const valueMap: Record<string, number | null> = {};
        for (const fv of values as FieldValue[]) {
          if (!(fv.field_id in valueMap)) {
            valueMap[fv.field_id] = fv.value_number ?? null;
          }
        }
        setFieldValues(valueMap);
      } catch { /* ignore */ }
      if (!cancelled) setLoadingValues(false);
    })();
    return () => { cancelled = true; };
  }, [selectedDate, fields, kpiId]);

  const computedResults = (() => {
    const results: Record<string, number | null> = {};
    const nameToInput = new Map<string, CustomField>();
    for (const field of fields) {
      if (field.field_role === 'input') nameToInput.set(field.name.trim(), field);
    }
    for (const formula of formulas) {
      if (!formula.result_field_id) continue;
      try {
        const parsed = parseFormula(formula.expression);
        const numericValues: Record<string, number> = {};
        let complete = true;
        for (const parsedField of parsed.fields) {
          const inputField = nameToInput.get(parsedField.variable.trim());
          const value = inputField ? fieldValues[inputField.id] : null;
          if (value == null || isNaN(value)) { complete = false; break; }
          numericValues[parsedField.variable] = value;
        }
        results[formula.result_field_id] = complete ? parsed.compute(numericValues) : null;
      } catch {
        results[formula.result_field_id] = null;
      }
    }
    return results;
  })();

  const visibleFields = fields
    .filter((f) => !f.hidden_in_dashboard)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });

  const chartData = useMemo(() => {
    const latestByDate = new Map<string, DataEntryWithProfile>();
    for (const entry of entries) {
      if (!latestByDate.has(entry.entry_date)) latestByDate.set(entry.entry_date, entry);
    }
    return [...latestByDate.values()]
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .map((entry) => ({
        date: entry.entry_date,
        label: new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
        value: Number(entry.value),
      }))
      .filter((entry) => Number.isFinite(entry.value));
  }, [entries]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <History className="w-5 h-5 text-slate-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 truncate">Historial de cargas</h3>
              <p className="text-xs text-gray-400 truncate">{kpiName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 text-slate-400 animate-spin" />
          </div>
        ) : dates.length === 0 ? (
          <div className="py-20 text-center">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No hay cargas anteriores para este KPI.</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {chartData.length > 0 && (
              <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                  <p className="text-xs font-semibold text-slate-600">Progresión histórica</p>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={42} />
                      <Tooltip
                        labelFormatter={(_label: unknown, payload: ReadonlyArray<{ payload?: { date?: string } }>) =>
                          payload[0]?.payload?.date ? formatDate(payload[0].payload.date) : ''}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 11 }}
                      />
                      <Line type="monotone" dataKey="value" name="Valor" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: '#2563eb', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">
            <div className="sm:w-56 border-b sm:border-b-0 sm:border-r border-gray-100 overflow-y-auto max-h-48 sm:max-h-none">
              <p className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/50">Fechas de carga</p>
              {dates.map((date) => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-l-2 ${
                    selectedDate === date
                      ? 'bg-blue-50 text-blue-700 font-semibold border-blue-500'
                      : 'text-gray-600 hover:bg-gray-50 border-transparent'
                  }`}
                >
                  {formatDate(date)}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loadingValues ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : visibleFields.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">No hay campos configurados.</p>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-xs font-semibold text-slate-600">Valores del {formatDate(selectedDate!)}</p>
                  </div>
                  <div className="space-y-1.5">
                    {visibleFields.map((field) => {
                      const c = getColorClasses(field.color);
                      const isInput = field.field_role === 'input';
                      const value = isInput
                        ? fieldValues[field.id] ?? null
                        : computedResults[field.id] ?? null;
                      return (
                        <div key={field.id} className={`${c.bg} border ${c.border} rounded-lg px-3 py-2`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-semibold ${c.label} leading-snug truncate`}>{field.label}</p>
                            <p className={`text-sm font-bold ${c.value} leading-tight flex-shrink-0`}>
                              {value != null && !isNaN(value) ? formatValue(value, field.unit ?? '%') : '—'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
