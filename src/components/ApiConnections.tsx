import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, X, Plug, Save, Power, Wifi, Upload, FileJson, AlertTriangle } from 'lucide-react';
import { fetchApiConnections, createApiConnection, updateApiConnection, deleteApiConnection, testApiConnection } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ApiConnection } from '@/types';

const AUTH_TYPES = [
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api_key', label: 'API Key' },
  { value: 'basic', label: 'Usuario y Contraseña (Basic)' },
  { value: 'none', label: 'Sin autenticación' },
];

export function ApiConnections() {
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApiConnection | null>(null);

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [authType, setAuthType] = useState('bearer');
  const [authConfig, setAuthConfig] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { const c = await fetchApiConnections(); setConnections(c); } catch { /* ignore */ }
    setLoading(false);
  };

  const resetForm = () => {
    setName(''); setBaseUrl(''); setApiKey(''); setAuthType('bearer'); setAuthConfig({}); setEditing(null); setShowForm(false);
  };

  const handleServiceAccountImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const required = ['project_id', 'private_key', 'client_email'];
      if (parsed.type !== 'service_account' || required.some((key) => typeof parsed[key] !== 'string' || !parsed[key])) {
        throw new Error('El archivo no parece una credencial válida de Google Service Account.');
      }

      setName(`AsOfix - ${String(parsed.project_id)}`);
      setBaseUrl('https://sheets.googleapis.com/v4/spreadsheets');
      setAuthType('bearer');
      setAuthConfig({
        service_account: JSON.stringify(parsed),
        project_id: String(parsed.project_id),
        client_email: String(parsed.client_email),
      });
      setImportMessage({ type: 'success', text: 'Credencial importada. Revisá los datos y guardá la conexión.' });
    } catch (error) {
      setImportMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo leer el archivo JSON.' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await updateApiConnection(editing.id, { name, base_url: baseUrl, auth_type: authType as ApiConnection['auth_type'], auth_config: authConfig, api_key: apiKey || null });
      } else {
        await createApiConnection({ name, base_url: baseUrl, auth_type: authType, auth_config: authConfig, api_key: apiKey || null });
      }
      resetForm();
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  const handleToggleActive = async (conn: ApiConnection) => {
    setBusy(true);
    try { await updateApiConnection(conn.id, { is_active: !conn.is_active }); await load(); } catch { /* ignore */ }
    setBusy(false);
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try { await deleteApiConnection(id); setConnections((prev) => prev.filter((c) => c.id !== id)); } catch { /* ignore */ }
    setBusy(false);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    await handleDelete(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  const handleEdit = (conn: ApiConnection) => {
    setEditing(conn);
    setName(conn.name); setBaseUrl(conn.base_url); setApiKey(conn.api_key ?? ''); setAuthType(conn.auth_type);
    setAuthConfig(conn.auth_config ?? {});
    setShowForm(true);
  };

  const handleTest = async (conn: ApiConnection) => {
    setTestingId(conn.id);
    setTestResult(null);
    try {
      if (!session) throw new Error('No hay sesión');
      const result = await testApiConnection({ base_url: conn.base_url, auth_type: conn.auth_type, auth_config: conn.auth_config ?? {} }, session.access_token);
      setTestResult({ id: conn.id, success: result.success, message: result.message });
    } catch (err) {
      setTestResult({ id: conn.id, success: false, message: err instanceof Error ? err.message : 'Error' });
    }
    setTestingId(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center"><Plug className="w-6 h-6 text-white" /></div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Conexiones API</h2>
              <p className="text-sm text-gray-500">Conectá sistemas externos para alimentar el tablero automáticamente.</p>
            </div>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"><Plus className="w-4 h-4" /> Nueva conexión</button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-gray-900">{editing ? 'Editar conexión' : 'Nueva conexión API'}</h3>
            <button onClick={resetForm} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editing && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="flex items-start gap-3">
                  <FileJson className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-orange-900">Configuración automática de AsOfix</p>
                    <p className="mt-1 text-xs leading-5 text-orange-800">Subí el JSON de Google Service Account y completaremos nombre, URL y credenciales automáticamente.</p>
                    <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleServiceAccountImport} className="sr-only" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-700">
                      <Upload className="h-4 w-4" /> Subir archivo JSON
                    </button>
                  </div>
                </div>
                {importMessage && (
                  <div className={`mt-3 flex items-start gap-2 rounded-lg p-3 text-xs ${importMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {importMessage.type === 'error' && <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                    <span>{importMessage.text}</span>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Nombre</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="CRM Ruiz" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">URL base</label>
                <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="https://api.sistema.com/v1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">API Key</label>
              <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="sk-... (opcional)" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tipo de autenticación</label>
              <select value={authType} onChange={(e) => setAuthType(e.target.value)} className="w-full md:w-1/2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                {AUTH_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {authType === 'bearer' && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Token</label>
                <input type="text" value={authConfig.token ?? ''} onChange={(e) => setAuthConfig({ ...authConfig, token: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="eyJhbGciOi..." />
              </div>
            )}
            {authType === 'api_key' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Nombre del header</label>
                  <input type="text" value={authConfig.header_name ?? 'X-API-Key'} onChange={(e) => setAuthConfig({ ...authConfig, header_name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="X-API-Key" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Valor de la key</label>
                  <input type="text" value={authConfig.api_key ?? ''} onChange={(e) => setAuthConfig({ ...authConfig, api_key: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="sk-..." />
                </div>
              </div>
            )}
            {authType === 'basic' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Usuario</label>
                  <input type="text" value={authConfig.username ?? ''} onChange={(e) => setAuthConfig({ ...authConfig, username: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Contraseña</label>
                  <input type="password" value={authConfig.password ?? ''} onChange={(e) => setAuthConfig({ ...authConfig, password: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>
            )}
            <button type="submit" disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editing ? 'Guardar cambios' : 'Crear conexión'}</button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-900">Conexiones configuradas</h3></div>
        {connections.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm text-gray-400">No hay conexiones API configuradas.</p></div>
        ) : (
          <div className="divide-y divide-gray-100">
            {connections.map((conn) => (
              <div key={conn.id}>
                <div className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${conn.is_active ? 'bg-emerald-50' : 'bg-slate-100'}`}><Plug className={`w-5 h-5 ${conn.is_active ? 'text-emerald-600' : 'text-gray-400'}`} /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{conn.name}</p>
                      <p className="text-xs text-gray-400 truncate">{conn.base_url} · {AUTH_TYPES.find((t) => t.value === conn.auth_type)?.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-medium px-2 py-1 rounded-lg ${conn.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{conn.is_active ? 'Activa' : 'Inactiva'}</span>
                    <button onClick={() => handleTest(conn)} disabled={testingId === conn.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50">
                      {testingId === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      Probar
                    </button>
                    <button onClick={() => handleToggleActive(conn)} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title={conn.is_active ? 'Desactivar' : 'Activar'}><Power className="w-4 h-4" /></button>
                    <button onClick={() => handleEdit(conn)} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors text-xs font-medium">Editar</button>
                    <button onClick={() => setConfirmDeleteId(conn.id)} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {testResult?.id === conn.id && (
                  <div className={`px-5 pb-4 ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${testResult.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      {testResult.success ? <Plug className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      {testResult.message}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        message="¿Seguro que querés eliminar esta conexión API? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
