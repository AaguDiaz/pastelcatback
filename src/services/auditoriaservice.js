const supabase = require('../config/supabase');
const getSupabaseAdmin = require('../config/supabaseAdmin');
const { AppError, fromSupabaseError } = require('../utils/errors');

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const DEFAULT_TOP_USERS = 8;
const MAX_TOP_USERS = 20;
const MAX_SUMMARY_EVENTS = 5000;
const MAX_LIST_EVENTS = 2000;
const AUDIT_API_PAGE_SIZE = 200;
const SUPPORTED_EVENT_TYPES = new Set(['LOGIN', 'USER_LOGOUT']);
const AUDIT_ACTION_TO_EVENT = {
  login: 'LOGIN',
  logout: 'USER_LOGOUT',
  user_logout: 'USER_LOGOUT',
  token_revoked: 'USER_LOGOUT',
};

const ensureAdminClient = () => {
  try {
    return getSupabaseAdmin();
  } catch (err) {
    throw AppError.internal('No se pudo conectar con Supabase (service_role). Verifica la configuraci��n.');
  }
};

const ensureAuditApiConfig = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw AppError.internal('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para consultar el historial de autenticaci��n.');
  }

  return { supabaseUrl, serviceRoleKey };
};

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const normalizePageSize = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
};

const normalizeTopUsersLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TOP_USERS;
  }
  return Math.min(parsed, MAX_TOP_USERS);
};

const parseDateInput = (value, field) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.badRequest(`La fecha proporcionada en ${field} es inv��lida.`);
  }
  return date;
};

const normalizeDateRange = (start, end, fallbackDays = DEFAULT_RANGE_DAYS) => {
  const now = new Date();
  const startDate = parseDateInput(start, 'startDate') || new Date(now.getTime() - fallbackDays * MS_IN_DAY);
  const endDate = parseDateInput(end, 'endDate') || now;

  if (startDate > endDate) {
    throw AppError.badRequest('La fecha inicial no puede ser posterior a la fecha final.');
  }

  const normalizedStart = new Date(startDate.getTime());
  normalizedStart.setUTCHours(0, 0, 0, 0);
  const normalizedEnd = new Date(endDate.getTime());
  normalizedEnd.setUTCHours(23, 59, 59, 999);

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
    startISO: normalizedStart.toISOString(),
    endISO: normalizedEnd.toISOString(),
  };
};

const normalizeEventTypes = (value) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalized = source
    .map((item) => sanitizeString(item).toUpperCase())
    .filter((item) => SUPPORTED_EVENT_TYPES.has(item));

  if (normalized.length) {
    return normalized;
  }

  return Array.from(SUPPORTED_EVENT_TYPES);
};

const mapAuditActionToEventType = (action = '') => {
  if (!action) return null;
  const mapped = AUDIT_ACTION_TO_EVENT[String(action).toLowerCase()];
  return mapped || null;
};

const fetchAuditApiPage = async ({ page, perPage, startISO, endISO, actorId }) => {
  const { supabaseUrl, serviceRoleKey } = ensureAuditApiConfig();
  const url = new URL('/auth/v1/admin/audit', supabaseUrl);
  url.searchParams.set('page', page);
  url.searchParams.set('per_page', perPage);

  if (startISO) {
    url.searchParams.set('created_after', startISO);
  }

  if (endISO) {
    url.searchParams.set('created_before', endISO);
  }

  if (actorId) {
    url.searchParams.set('actor_id', actorId);
  }

  const response = await fetch(url.toString(), {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw AppError.internal('No se pudo obtener el historial de autenticaci��n.', {
      status: response.status,
      body,
    });
  }

  const data = await response.json();
  const total = Number(response.headers.get('x-total-count')) || null;
  return {
    data: Array.isArray(data) ? data : [],
    total,
  };
};

const collectAuditEvents = async ({ range, actorId, eventTypes, maxEvents, maxScan }) => {
  const rows = [];
  const normalizedTypes = Array.isArray(eventTypes) && eventTypes.length ? eventTypes : Array.from(SUPPORTED_EVENT_TYPES);
  const perPage = AUDIT_API_PAGE_SIZE;
  let page = 1;
  let scanned = 0;

  while (rows.length < maxEvents && scanned < maxScan) {
    const { data } = await fetchAuditApiPage({
      page,
      perPage,
      startISO: range?.startISO,
      endISO: range?.endISO,
      actorId,
    });

    if (!data.length) {
      break;
    }

    scanned += data.length;

    data.forEach((raw) => {
      const payload = safePayload(raw.payload);
      const action = payload?.action || raw?.action || null;
      const eventType = mapAuditActionToEventType(action);
      if (!eventType || !normalizedTypes.includes(eventType)) {
        return;
      }

      const userIdValue = getUserIdFromPayload(payload);
      rows.push({
        id: raw.id,
        created_at: raw.created_at,
        payload,
        ip_address: raw.ip_address || null,
        eventType,
        userId: userIdValue,
      });
    });

    if (data.length < perPage) {
      break;
    }

    page += 1;
  }

  return { rows, scanned };
};

const safePayload = (payload) => {
  if (!payload) return {};
  if (typeof payload === 'object') return payload;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch (err) {
      return { raw: payload };
    }
  }
  return {};
};

const pickValue = (obj, paths) => {
  for (const path of paths) {
    const segments = Array.isArray(path) ? path : String(path).split('.');
    let current = obj;
    let valid = true;
    for (const segment of segments) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        valid = false;
        break;
      }
      current = current[segment];
    }
    if (valid && (typeof current === 'string' || typeof current === 'number')) {
      return current;
    }
  }
  return null;
};

const getEventTypeFromPayload = (payload) => {
  const candidates = [
    payload.event_type,
    payload.eventType,
    payload.event,
    payload.type,
    payload.action,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toUpperCase();
      if (SUPPORTED_EVENT_TYPES.has(normalized)) {
        return normalized;
      }
    }
  }
  return null;
};

const getUserIdFromPayload = (payload) => {
  const candidates = [
    payload.user_id,
    payload.userId,
    payload.actor_id,
    payload.sub,
    payload.subject,
    payload?.user?.id,
    payload?.session?.user?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
};

const getEmailFromPayload = (payload) => {
  const candidates = [
    payload.email,
    payload.user_email,
    payload.userEmail,
    payload.actor_username,
    payload?.user?.email,
    payload?.session?.user?.email,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  return null;
};

const getIpFromRow = (row, payload) => {
  const candidates = [
    row.ip_address,
    payload.ip_address,
    payload.ip,
    payload.ipAddress,
    payload?.request?.ip,
    payload?.request_ip,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
};

const fetchProfilesByAuthIds = async (authIds = []) => {
  if (!authIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('perfil')
    .select('id, id_perfil, nombre, is_active')
    .in('id', authIds);

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron obtener los perfiles vinculados a los usuarios.');
  }

  const map = new Map();
  (data || []).forEach((perfil) => {
    if (perfil?.id) {
      map.set(perfil.id, perfil);
    }
  });
  return map;
};

const fetchAuthUsersByIds = async (supabaseAdmin, authIds = []) => {
  if (!authIds.length) {
    return new Map();
  }

  const entries = await Promise.all(
    authIds.map(async (userId) => {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (data?.user) {
          return [userId, data.user];
        }
      } catch (err) {
        return null;
      }
      return null;
    }),
  );

  const map = new Map();
  entries.forEach((entry) => {
    if (entry && entry[0]) {
      map.set(entry[0], entry[1]);
    }
  });
  return map;
};

const formatAuthEvent = (row, profileMap, authUsersMap) => {
  const payload = safePayload(row.payload);
  const eventType = row.eventType || getEventTypeFromPayload(payload);
  const userId = row.userId || getUserIdFromPayload(payload);
  const email = getEmailFromPayload(payload) || authUsersMap.get(userId)?.email || null;
  const profile = userId ? profileMap.get(userId) : null;

  return {
    id: row.id,
    createdAt: row.created_at,
    eventType,
    ipAddress: getIpFromRow(row, payload),
    userId,
    perfilId: profile?.id_perfil ?? null,
    userName: profile?.nombre ?? authUsersMap.get(userId)?.user_metadata?.full_name ?? null,
    email,
    isActive: profile?.is_active ?? null,
    metadata: {
      authMethod: payload.auth_method || payload.authMethod || null,
      action: payload.action || null,
      sessionId: payload.session_id || payload?.session?.id || null,
      audience: payload.aud || payload.audience || null,
      issuer: payload.iss || null,
    },
  };
};

const loadMetadataMaps = async (supabaseAdmin, userIds) => {
  if (!userIds.length) {
    return { profileMap: new Map(), authUsersMap: new Map() };
  }

  const [profileMap, authUsersMap] = await Promise.all([
    fetchProfilesByAuthIds(userIds),
    fetchAuthUsersByIds(supabaseAdmin, userIds),
  ]);

  return { profileMap, authUsersMap };
};

const getAuthEvents = async ({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  startDate,
  endDate,
  userId,
  eventTypes,
} = {}) => {
  const supabaseAdmin = ensureAdminClient();
  const safePage = normalizePage(page);
  const safePageSize = normalizePageSize(pageSize);
  const { startISO, endISO } = normalizeDateRange(startDate, endDate);
  const types = normalizeEventTypes(eventTypes);
  const normalizedUserId = sanitizeString(userId);
  const { rows } = await collectAuditEvents({
    range: { startISO, endISO },
    actorId: normalizedUserId,
    eventTypes: types,
    maxEvents: MAX_LIST_EVENTS,
    maxScan: MAX_SUMMARY_EVENTS,
  });

  const offset = (safePage - 1) * safePageSize;
  const pagedRows = rows.slice(offset, offset + safePageSize);

  const uniqueIds = [...new Set(pagedRows.map((row) => row.userId).filter(Boolean))];
  const { profileMap, authUsersMap } = await loadMetadataMaps(supabaseAdmin, uniqueIds);

  const formatted = pagedRows.map((row) => formatAuthEvent(row, profileMap, authUsersMap));
  const totalItems = rows.length;
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / safePageSize) : 0;

  return {
    data: formatted,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages,
    },
    filters: {
      eventTypes: types,
      userId: normalizedUserId || null,
      startDate: startISO,
      endDate: endISO,
    },
  };
};

const bucketTimeline = (map, dateKey, eventType) => {
  if (!dateKey) return;
  const entry = map.get(dateKey) || { date: dateKey, logins: 0, logouts: 0, total: 0 };
  if (eventType === 'LOGIN') {
    entry.logins += 1;
  } else if (eventType === 'USER_LOGOUT') {
    entry.logouts += 1;
  }
  entry.total += 1;
  map.set(dateKey, entry);
};

const buildTimelineSeries = (timelineMap) => {
  return Array.from(timelineMap.values())
    .sort((a, b) => (a.date < b.date ? -1 : 1));
};

const accumulateUserStats = (statsMap, row) => {
  if (!row.userId) return;
  const entry = statsMap.get(row.userId) || {
    userId: row.userId,
    logins: 0,
    logouts: 0,
    total: 0,
    firstEventAt: row.created_at,
    lastEventAt: row.created_at,
  };

  if (row.eventType === 'LOGIN') {
    entry.logins += 1;
  } else if (row.eventType === 'USER_LOGOUT') {
    entry.logouts += 1;
  }
  entry.total += 1;

  if (!entry.firstEventAt || row.created_at < entry.firstEventAt) {
    entry.firstEventAt = row.created_at;
  }
  if (!entry.lastEventAt || row.created_at > entry.lastEventAt) {
    entry.lastEventAt = row.created_at;
  }

  statsMap.set(row.userId, entry);
};

const sliceTopUsers = (stats, limit) => {
  return stats
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.logins !== a.logins) return b.logins - a.logins;
      return (b.lastEventAt || '').localeCompare(a.lastEventAt || '');
    })
    .slice(0, limit);
};

const getAuthUsageSummary = async ({
  startDate,
  endDate,
  topLimit,
} = {}) => {
  const supabaseAdmin = ensureAdminClient();
  const { startISO, endISO } = normalizeDateRange(startDate, endDate);
  const limit = normalizeTopUsersLimit(topLimit);
  const timelineMap = new Map();
  const userStatsMap = new Map();
  let totalLogins = 0;
  let totalLogouts = 0;
  const { rows, scanned } = await collectAuditEvents({
    range: { startISO, endISO },
    actorId: null,
    eventTypes: Array.from(SUPPORTED_EVENT_TYPES),
    maxEvents: MAX_SUMMARY_EVENTS,
    maxScan: MAX_SUMMARY_EVENTS,
  });

  rows.forEach((row) => {
    const eventType = row.eventType;
    if (!eventType) {
      return;
    }

    const dateKey = row.created_at ? row.created_at.slice(0, 10) : null;
    bucketTimeline(timelineMap, dateKey, eventType);
    accumulateUserStats(userStatsMap, row);

    if (eventType === 'LOGIN') {
      totalLogins += 1;
    } else if (eventType === 'USER_LOGOUT') {
      totalLogouts += 1;
    }
  });

  const statsList = Array.from(userStatsMap.values());
  const topUsersRaw = sliceTopUsers(statsList, limit);
  const topUserIds = topUsersRaw.map((item) => item.userId).filter(Boolean);
  const { profileMap, authUsersMap } = await loadMetadataMaps(supabaseAdmin, topUserIds);

  const topUsers = topUsersRaw.map((item) => {
    const profile = profileMap.get(item.userId);
    const authUser = authUsersMap.get(item.userId);
    return {
      userId: item.userId,
      perfilId: profile?.id_perfil ?? null,
      nombre: profile?.nombre ?? authUser?.user_metadata?.full_name ?? null,
      email: authUser?.email ?? null,
      isActive: profile?.is_active ?? null,
      logins: item.logins,
      logouts: item.logouts,
      total: item.total,
      firstEventAt: item.firstEventAt,
      lastEventAt: item.lastEventAt,
    };
  });

  return {
    range: {
      startDate: startISO,
      endDate: endISO,
    },
    totals: {
      events: totalLogins + totalLogouts,
      logins: totalLogins,
      logouts: totalLogouts,
      scannedEvents: scanned,
      maxEvents: MAX_SUMMARY_EVENTS,
    },
    timeline: buildTimelineSeries(timelineMap),
    topUsers,
  };
};

module.exports = {
  getAuthEvents,
  getAuthUsageSummary,
};
