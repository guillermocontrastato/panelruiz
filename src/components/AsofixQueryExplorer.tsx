import { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, Play, AlertCircle, Table2, ChevronRight, RefreshCw, Download } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { listAsofixDatasets, listAsofixTables, runAsofixQuery, type AsofixQueryResult } from '@/lib/api';

const EXAMPLES = [
  { label: 'Ver todas las tablas', sql: 'SELECT table_name FROM `asofix-produccion.INFORMATION_SCHEMA.TABLES` ORDER BY table_name' },
  { label: 'Primeras 50 filas', sql: 'SELECT * FROM `asofix-produccion.__TABLE__` LIMIT 50' },
  { label: 'Esquema de una tabla', sql: 'SELECT column_name, data_type FROM `asofix-produccion.INFORMATION_SCHEMA.COLUMNS` WHERE table_name = "__TABLE__"' },
];

function formatCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AsofixQueryExplorer() {
  const { session } = useAuth();
  const [sql, setSql] = useState('SELECT table_name FROM `asofix-produccion.INFORMATION_SCHEMA.TABLES` ORDER BY table_name');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AsofixQueryResult | null>(null);
  const [datasets, setDatasets] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [maxResults, setMaxResults] = useState(100);

  const loadDatasets = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingMeta(true);
    try {
      const ds = await listAsofixDatasets(session.access_token);
      setDatasets(ds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al listar datasets');
    }
    setLoadingMeta(false);
  }, [session?.access_token]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  const handleSelectDataset = async (datasetId: string) => {
    setSelectedDataset(datasetId);
    setTables([]);
    if (!session?.access_token) return;
    try {
      const ts = await listAsofixTables(session.access_token, datasetId);
      setTables(ts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al listar tablas');
    }
  };

  const handleRunQuery = async () => {
    if (!session?.access_token || !sql.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runAsofixQuery(session.access_token, sql.trim(), maxResults);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al ejecutar la consulta');
    }
    setLoading(false);
  };

  const handleTableClick = (tableName: string) => {
    const newSql = `SELECT * FROM \`asofix-produccion.${selectedDataset}.${tableName}\` LIMIT ${maxResults}`;
    setSql(newSql);
  };

  const handleDownload = () => {
    if (!result || result.rows.length === 0) return;
    const csv = [
      result.columns.join(','),
      ...result.rows.map((row) => row.map((cell) => {
        const s = formatCell(cell);
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asofix-query-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <Database className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Consultas a Asófix (BigQuery)</h2>
            <p className="text-sm text-gray-500 mt-1">Escribí consultas SQL sobre las bases de datos de Asófix Producción. Usá el panel izquierdo para explorar datasets y tablas.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Table2 className="w-4 h-4 text-cyan-600" />
              Explorador
            </h3>
            <button onClick={loadDatasets} disabled={loadingMeta} title="Refrescar datasets" className="p-1 rounded-lg text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMeta ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {datasets.length === 0 && !loadingMeta && (
            <p className="text-xs text-gray-400 py-4 text-center">
              {error ? 'Revisá la conexión de Asófix.' : 'No se encontraron datasets.'}
            </p>
          )}

          {datasets.map((ds) => (
            <div key={ds}>
              <button
                onClick={() => handleSelectDataset(ds)}
                className={`w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  selectedDataset === ds ? 'bg-cyan-50 text-cyan-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${selectedDataset === ds ? 'rotate-90' : ''}`} />
                <Database className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{ds}</span>
              </button>
              {selectedDataset === ds && tables.length > 0 && (
                <div className="ml-6 mt-1 space-y-0.5">
                  {tables.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleTableClick(t)}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-gray-500 hover:text-cyan-700 hover:bg-cyan-50 transition-colors"
                    >
                      <Table2 className="w-3 h-3 flex-shrink-0 opacity-60" />
                      <span className="truncate">{t}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">Consulta SQL</h3>
              <div className="flex items-center gap-2">
                <select
                  value={maxResults}
                  onChange={(e) => setMaxResults(Number(e.target.value))}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value={50}>50 filas</option>
                  <option value={100}>100 filas</option>
                  <option value={500}>500 filas</option>
                  <option value={1000}>1000 filas</option>
                </select>
                <button
                  onClick={handleRunQuery}
                  disabled={loading || !sql.trim()}
                  className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Ejecutar
                </button>
              </div>
            </div>

            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={6}
              spellCheck={false}
              className="w-full font-mono text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 resize-y focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="SELECT * FROM `asofix-produccion.dataset.tabla` LIMIT 100"
            />

            <div className="flex flex-wrap gap-2 mt-3">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => setSql(ex.sql)}
                  className="text-[11px] font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Error en la consulta</p>
                <p className="text-xs text-red-600 mt-1 font-mono whitespace-pre-wrap">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Resultados</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {result.rows.length} fila{result.rows.length !== 1 ? 's' : ''} de {result.totalRows} totales
                    {result.rows.length < result.totalRows && ' (mostrando las primeras)'}
                  </p>
                </div>
                <button
                  onClick={handleDownload}
                  disabled={result.rows.length === 0}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar CSV
                </button>
              </div>

              {result.rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">La consulta no devolvió filas.</div>
              ) : (
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        {result.columns.map((col) => (
                          <th key={col} className="px-4 py-2.5 text-left font-semibold text-gray-700 whitespace-nowrap border-b border-gray-200">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {result.rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-cyan-50/40 transition-colors">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-4 py-2 text-gray-600 whitespace-nowrap font-mono">
                              {formatCell(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
