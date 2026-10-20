import type {
  Area, AreaWithKpis, Kpi, KpiData, KpiBreakdown, Profile, UserArea,
  DataEntryWithProfile, UserRole, CustomField, Formula,
  ApiConnection, Notification,
} from '@/types';
import { INITIAL_AREAS_WITH_KPIS, DEMO_PROFILES } from './mock-data';

const STORAGE_KEYS = {
  AREAS_WITH_KPIS: 'ruiz_store_areas_with_kpis',
  PROFILES: 'ruiz_store_profiles',
  USER_AREAS: 'ruiz_store_user_areas',
  DATA_ENTRIES: 'ruiz_store_data_entries',
  CUSTOM_FIELDS: 'ruiz_store_custom_fields',
  FORMULAS: 'ruiz_store_formulas',
  NOTIFICATIONS: 'ruiz_store_notifications',
  API_CONNECTIONS: 'ruiz_store_api_connections',
};

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

class MockStore {
  private areasWithKpis: AreaWithKpis[];
  private profiles: Profile[];
  private userAreas: UserArea[];
  private dataEntries: DataEntryWithProfile[];
  private customFields: CustomField[];
  private formulas: Formula[];
  private notifications: Notification[];
  private apiConnections: ApiConnection[];

  constructor() {
    this.areasWithKpis = loadFromStorage(STORAGE_KEYS.AREAS_WITH_KPIS, INITIAL_AREAS_WITH_KPIS);
    this.profiles = loadFromStorage(STORAGE_KEYS.PROFILES, DEMO_PROFILES);
    this.userAreas = loadFromStorage(STORAGE_KEYS.USER_AREAS, []);
    this.dataEntries = loadFromStorage(STORAGE_KEYS.DATA_ENTRIES, []);
    this.customFields = loadFromStorage(STORAGE_KEYS.CUSTOM_FIELDS, []);
    this.formulas = loadFromStorage(STORAGE_KEYS.FORMULAS, []);
    this.notifications = loadFromStorage(STORAGE_KEYS.NOTIFICATIONS, [
      {
        id: 'notif-1',
        user_id: 'demo-admin-id',
        target_role: 'admin',
        area_id: 'area-ventas-0km',
        kpi_id: 'kpi-v1',
        action: 'Objetivo alcanzado',
        message: 'Ventas 0km superó el 92% de cumplimiento comercial en el último período.',
        is_read: false,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        profiles: { full_name: 'Director General', email: 'director@ruizautomotores.com' },
      },
    ]);
    this.apiConnections = loadFromStorage(STORAGE_KEYS.API_CONNECTIONS, [
      {
        id: 'conn-1',
        name: 'Asófix DMS Conector',
        base_url: 'https://api.asofix.com.ar/v1',
        auth_type: 'api_key',
        auth_config: {},
        api_key: 'asofix_demo_key_9921',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ]);
  }

  // --- Areas ---
  getAreas(): Area[] {
    return this.areasWithKpis.map((area) => ({
      id: area.id,
      slug: area.slug,
      name: area.name,
      icon: area.icon,
      description: area.description,
      sort_order: area.sort_order,
      color: area.color,
    })).sort((a, b) => a.sort_order - b.sort_order);
  }

  getAllAreasWithKpis(): AreaWithKpis[] {
    return [...this.areasWithKpis].sort((a, b) => a.sort_order - b.sort_order);
  }

  getAreaWithKpis(areaId: string): AreaWithKpis | null {
    return this.areasWithKpis.find((a) => a.id === areaId) ?? null;
  }

  createArea(area: { name: string; slug: string; icon: string; description: string; color: string; sort_order?: number }): void {
    const newArea: AreaWithKpis = {
      id: `area-${Date.now()}`,
      name: area.name,
      slug: area.slug,
      icon: area.icon,
      description: area.description,
      color: area.color,
      sort_order: area.sort_order ?? this.areasWithKpis.length + 1,
      kpis: [],
    };
    this.areasWithKpis.push(newArea);
    saveToStorage(STORAGE_KEYS.AREAS_WITH_KPIS, this.areasWithKpis);
  }

  updateArea(id: string, updates: Partial<Area>): void {
    const index = this.areasWithKpis.findIndex((a) => a.id === id);
    if (index !== -1) {
      this.areasWithKpis[index] = { ...this.areasWithKpis[index], ...updates };
      saveToStorage(STORAGE_KEYS.AREAS_WITH_KPIS, this.areasWithKpis);
    }
  }

  deleteArea(id: string): void {
    this.areasWithKpis = this.areasWithKpis.filter((a) => a.id !== id);
    saveToStorage(STORAGE_KEYS.AREAS_WITH_KPIS, this.areasWithKpis);
  }

  reorderAreas(orderedIds: string[]): void {
    this.areasWithKpis.forEach((area) => {
      const idx = orderedIds.indexOf(area.id);
      if (idx !== -1) area.sort_order = idx;
    });
    saveToStorage(STORAGE_KEYS.AREAS_WITH_KPIS, this.areasWithKpis);
  }

  // --- KPIs ---
  getKpisByArea(areaId: string): Kpi[] {
    const area = this.areasWithKpis.find((a) => a.id === areaId);
    if (!area) return [];
    return area.kpis.map((kpi) => ({
      id: kpi.id,
      area_id: kpi.area_id,
      name: kpi.name,
      definition: kpi.definition,
      formula: kpi.formula,
      decision: kpi.decision,
      unit: kpi.unit,
      target_direction: kpi.target_direction,
      sort_order: kpi.sort_order,
    })).sort((a, b) => a.sort_order - b.sort_order);
  }

  getAllKpis(): Kpi[] {
    const all: Kpi[] = [];
    this.areasWithKpis.forEach((a) => {
      a.kpis.forEach((kpi) => {
        all.push({
          id: kpi.id,
          area_id: kpi.area_id,
          name: kpi.name,
          definition: kpi.definition,
          formula: kpi.formula,
          decision: kpi.decision,
          unit: kpi.unit,
          target_direction: kpi.target_direction,
          sort_order: kpi.sort_order,
        });
      });
    });
    return all.sort((a, b) => a.sort_order - b.sort_order);
  }

  createKpi(kpi: {
    area_id: string;
    name: string;
    definition?: string;
    formula?: string;
    decision?: string;
    unit?: string;
    target_value?: number;
    sort_order?: number;
  }): string {
    const id = `kpi-${Date.now()}`;
    const area = this.areasWithKpis.find((a) => a.id === kpi.area_id);
    if (area) {
      area.kpis.push({
        id,
        area_id: kpi.area_id,
        name: kpi.name,
        definition: kpi.definition ?? '',
        formula: kpi.formula ?? '',
        decision: kpi.decision ?? '',
        unit: kpi.unit ?? '%',
        target_direction: 'up',
        sort_order: kpi.sort_order ?? area.kpis.length + 1,
        data: {
          id: `kd-${Date.now()}`,
          kpi_id: id,
          current_value: 0,
          target_value: kpi.target_value ?? 100,
          previous_value: 0,
          trend: 'stable',
          series: [
            { month: 'Abr', value: 0 },
            { month: 'May', value: 0 },
            { month: 'Jun', value: 0 },
            { month: 'Jul', value: 0 },
            { month: 'Ago', value: 0 },
            { month: 'Sep', value: 0 },
          ],
          updated_at: new Date().toISOString(),
        },
        breakdowns: [],
      });
      saveToStorage(STORAGE_KEYS.AREAS_WITH_KPIS, this.areasWithKpis);
    }
    return id;
  }

  updateKpi(id: string, updates: Partial<Kpi>): void {
    for (const area of this.areasWithKpis) {
      const kpi = area.kpis.find((k) => k.id === id);
      if (kpi) {
        Object.assign(kpi, updates);
        saveToStorage(STORAGE_KEYS.AREAS_WITH_KPIS, this.areasWithKpis);
        break;
      }
    }
  }

  deleteKpi(id: string): void {
    for (const area of this.areasWithKpis) {
      area.kpis = area.kpis.filter((k) => k.id !== id);
    }
    this.dataEntries = this.dataEntries.filter((e) => e.kpi_id !== id);
    saveToStorage(STORAGE_KEYS.AREAS_WITH_KPIS, this.areasWithKpis);
    saveToStorage(STORAGE_KEYS.DATA_ENTRIES, this.dataEntries);
  }

  getKpiData(kpiId: string): KpiData | null {
    for (const area of this.areasWithKpis) {
      const kpi = area.kpis.find((k) => k.id === kpiId);
      if (kpi && kpi.data) return kpi.data;
    }
    return null;
  }

  getKpiBreakdowns(kpiId: string): KpiBreakdown[] {
    for (const area of this.areasWithKpis) {
      const kpi = area.kpis.find((k) => k.id === kpiId);
      if (kpi && kpi.breakdowns) return kpi.breakdowns;
    }
    return [];
  }

  updateKpiDataFromEntry(kpiId: string, value: number): void {
    for (const area of this.areasWithKpis) {
      const kpi = area.kpis.find((k) => k.id === kpiId);
      if (kpi) {
        if (!kpi.data) {
          kpi.data = {
            id: `kd-${Date.now()}`,
            kpi_id: kpiId,
            current_value: value,
            target_value: 100,
            previous_value: 0,
            trend: 'up',
            series: [{ month: 'Sep', value }],
            updated_at: new Date().toISOString(),
          };
        } else {
          const prev = kpi.data.current_value;
          const series = kpi.data.series ?? [];
          const months = ['Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep'];
          const newSeries = series.length >= 6
            ? [...series.slice(1), { month: months[5], value }]
            : [...series, { month: months[series.length] ?? 'Sep', value }];
          const trend = value > prev ? 'up' : value < prev ? 'down' : 'stable';
          kpi.data.previous_value = prev;
          kpi.data.current_value = value;
          kpi.data.trend = trend;
          kpi.data.series = newSeries;
          kpi.data.updated_at = new Date().toISOString();
        }
        saveToStorage(STORAGE_KEYS.AREAS_WITH_KPIS, this.areasWithKpis);
        break;
      }
    }
  }

  // --- Profiles ---
  getProfiles(): Profile[] {
    return [...this.profiles];
  }

  updateProfileRole(userId: string, role: UserRole): void {
    const p = this.profiles.find((u) => u.id === userId);
    if (p) {
      p.role = role;
      saveToStorage(STORAGE_KEYS.PROFILES, this.profiles);
    }
  }

  updateProfileActive(userId: string, active: boolean): void {
    const p = this.profiles.find((u) => u.id === userId);
    if (p) {
      p.active = active;
      saveToStorage(STORAGE_KEYS.PROFILES, this.profiles);
    }
  }

  updateProfileName(userId: string, fullName: string): void {
    const p = this.profiles.find((u) => u.id === userId);
    if (p) {
      p.full_name = fullName;
      saveToStorage(STORAGE_KEYS.PROFILES, this.profiles);
    }
  }

  adminCreateUser(params: { email: string; password: string; full_name: string; role: UserRole; area_ids: string[] }): void {
    const newProfile: Profile = {
      id: `profile-${Date.now()}`,
      email: params.email,
      full_name: params.full_name,
      role: params.role,
      active: true,
      created_at: new Date().toISOString(),
    };
    this.profiles.push(newProfile);
    params.area_ids.forEach((areaId) => {
      this.userAreas.push({
        id: `ua-${Date.now()}-${areaId}`,
        user_id: newProfile.id,
        area_id: areaId,
      });
    });
    saveToStorage(STORAGE_KEYS.PROFILES, this.profiles);
    saveToStorage(STORAGE_KEYS.USER_AREAS, this.userAreas);
  }

  adminDeleteUser(userId: string): void {
    this.profiles = this.profiles.filter((p) => p.id !== userId);
    this.userAreas = this.userAreas.filter((ua) => ua.user_id !== userId);
    saveToStorage(STORAGE_KEYS.PROFILES, this.profiles);
    saveToStorage(STORAGE_KEYS.USER_AREAS, this.userAreas);
  }

  // --- User Areas ---
  getUserAreas(userId: string): UserArea[] {
    return this.userAreas.filter((ua) => ua.user_id === userId);
  }

  getAllUserAreas(): UserArea[] {
    return [...this.userAreas];
  }

  addUserArea(userId: string, areaId: string): void {
    if (!this.userAreas.some((ua) => ua.user_id === userId && ua.area_id === areaId)) {
      this.userAreas.push({ id: `ua-${Date.now()}`, user_id: userId, area_id: areaId });
      saveToStorage(STORAGE_KEYS.USER_AREAS, this.userAreas);
    }
  }

  removeUserArea(userId: string, areaId: string): void {
    this.userAreas = this.userAreas.filter((ua) => !(ua.user_id === userId && ua.area_id === areaId));
    saveToStorage(STORAGE_KEYS.USER_AREAS, this.userAreas);
  }

  // --- Data Entries ---
  getDataEntries(kpiId: string): DataEntryWithProfile[] {
    return this.dataEntries.filter((e) => e.kpi_id === kpiId);
  }

  createDataEntry(entry: {
    kpi_id: string;
    value: number;
    entry_date: string;
    notes?: string;
    results_json?: Record<string, { label: string; value: number }>;
    inputs_json?: Record<string, { label: string; value: number }>;
  }): void {
    const kpi = this.getAllKpis().find((k) => k.id === entry.kpi_id);
    const newEntry: DataEntryWithProfile = {
      id: `entry-${Date.now()}`,
      kpi_id: entry.kpi_id,
      user_id: 'demo-admin-id',
      value: entry.value,
      entry_date: entry.entry_date,
      notes: entry.notes ?? '',
      results_json: entry.results_json ?? null,
      inputs_json: entry.inputs_json ?? null,
      created_at: new Date().toISOString(),
      profiles: { full_name: 'Director General', email: 'director@ruizautomotores.com' },
      kpis: kpi ? { name: kpi.name, unit: kpi.unit } : undefined,
    };
    this.dataEntries.unshift(newEntry);
    saveToStorage(STORAGE_KEYS.DATA_ENTRIES, this.dataEntries);
    this.updateKpiDataFromEntry(entry.kpi_id, entry.value);
  }

  deleteDataEntry(id: string): void {
    this.dataEntries = this.dataEntries.filter((e) => e.id !== id);
    saveToStorage(STORAGE_KEYS.DATA_ENTRIES, this.dataEntries);
  }

  // --- Custom Fields ---
  getCustomFieldsByArea(areaId: string): CustomField[] {
    return this.customFields.filter((f) => f.area_id === areaId).sort((a, b) => a.sort_order - b.sort_order);
  }

  createCustomField(field: Omit<CustomField, 'id' | 'created_at'>): CustomField {
    const newField: CustomField = {
      ...field,
      id: `cf-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    this.customFields.push(newField);
    saveToStorage(STORAGE_KEYS.CUSTOM_FIELDS, this.customFields);
    return newField;
  }

  deleteCustomField(id: string): void {
    this.customFields = this.customFields.filter((f) => f.id !== id);
    saveToStorage(STORAGE_KEYS.CUSTOM_FIELDS, this.customFields);
  }

  // --- Formulas ---
  getFormulasByArea(areaId: string): Formula[] {
    const kpis = this.getKpisByArea(areaId);
    const kpiIds = new Set(kpis.map((k) => k.id));
    return this.formulas.filter((f) => kpiIds.has(f.kpi_id)).sort((a, b) => a.sort_order - b.sort_order);
  }

  createFormula(formula: Omit<Formula, 'id' | 'created_at'>): Formula {
    const newFormula: Formula = {
      ...formula,
      id: `form-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    this.formulas.push(newFormula);
    saveToStorage(STORAGE_KEYS.FORMULAS, this.formulas);
    return newFormula;
  }

  deleteFormula(id: string): void {
    this.formulas = this.formulas.filter((f) => f.id !== id);
    saveToStorage(STORAGE_KEYS.FORMULAS, this.formulas);
  }

  // --- Notifications ---
  getNotifications(role: 'gerente' | 'admin'): Notification[] {
    return this.notifications.filter((n) => n.target_role === role);
  }

  createNotification(notif: { target_role: 'gerente' | 'admin'; area_id?: string | null; kpi_id?: string | null; action: string; message: string }): void {
    const n: Notification = {
      id: `notif-${Date.now()}`,
      user_id: 'demo-admin-id',
      target_role: notif.target_role,
      area_id: notif.area_id ?? null,
      kpi_id: notif.kpi_id ?? null,
      action: notif.action,
      message: notif.message,
      is_read: false,
      created_at: new Date().toISOString(),
      profiles: { full_name: 'Director General', email: 'director@ruizautomotores.com' },
    };
    this.notifications.unshift(n);
    saveToStorage(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
  }

  markNotificationRead(id: string): void {
    const n = this.notifications.find((notif) => notif.id === id);
    if (n) {
      n.is_read = true;
      saveToStorage(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
    }
  }

  deleteNotification(id: string): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    saveToStorage(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
  }

  deleteReadNotifications(targetRole: 'gerente' | 'admin'): void {
    this.notifications = this.notifications.filter((n) => !(n.is_read && n.target_role === targetRole));
    saveToStorage(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
  }

  // --- API Connections ---
  getApiConnections(): ApiConnection[] {
    return [...this.apiConnections];
  }
}

export const mockStore = new MockStore();
