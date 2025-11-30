const { AppError, fromSupabaseError } = require('../utils/errors');
const getSupabaseAdmin = require('../config/supabaseAdmin');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const normalizePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const normalizePageSize = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
};

const normalizeBool = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const str = String(value || '').toLowerCase();
  if (!str) return fallback;
  return ['true', '1', 'yes', 'si'].includes(str);
};

const normalizeCategory = (value) => {
  if (!value) return null;
  const val = String(value).toLowerCase();
  const allowed = ['pedido', 'evento', 'sistema'];
  return allowed.includes(val) ? val : null;
};

const fetchAllUserIds = async (client) => {
  const perPage = 1000;
  let page = 1;
  const ids = [];

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw AppError.internal('No se pudieron obtener usuarios para notificaciones.');
    }
    const users = data?.users || [];
    users.forEach((user) => {
      if (user?.id) ids.push(user.id);
    });
    if (users.length < perPage) break;
    page += 1;
  }

  return ids;
};

const createNotification = async ({
  title,
  body,
  category,
  trigger_type,
  id_pedido = null,
  id_evento = null,
  created_by = null,
  recipients = null,
}) => {
  const safeTitle = typeof title === 'string' ? title.trim() : '';
  const safeBody = typeof body === 'string' ? body.trim() : '';
  const safeCategory = normalizeCategory(category);
  const safeTrigger = typeof trigger_type === 'string' ? trigger_type.trim() : '';

  if (!safeTitle || !safeBody || !safeCategory) {
    throw AppError.badRequest('title, body y category son obligatorios.');
  }

  const supabase = getSupabaseAdmin();

  const { data: notification, error: notifError } = await supabase
    .from('notificaciones')
    .insert({
      title: safeTitle,
      body: safeBody,
      category: safeCategory,
      trigger_type: safeTrigger || null,
      id_pedido: id_pedido ?? null,
      id_evento: id_evento ?? null,
      created_by: created_by ?? null,
      created_at: new Date().toISOString(),
    })
    .select('id, created_at')
    .single();

  if (notifError || !notification) {
    throw fromSupabaseError(notifError, 'No se pudo crear la notificacion.');
  }

  let recipientIds = Array.isArray(recipients) ? recipients.filter(Boolean) : [];
  if (!recipientIds.length) {
    recipientIds = await fetchAllUserIds(supabase);
  }
  if (!recipientIds.length && created_by) {
    recipientIds = [created_by];
  }
  if (!recipientIds.length) {
    throw AppError.badRequest('No hay destinatarios para esta notificacion.');
  }

  const rows = Array.from(new Set(recipientIds)).map((userId) => ({
    id_notification: notification.id,
    id_user: userId,
    is_read: false,
    read_at: null,
  }));

  const { error: recipientsError } = await supabase
    .from('notificaciones_recipiente')
    .insert(rows);

  if (recipientsError) {
    throw fromSupabaseError(recipientsError, 'No se pudieron registrar los destinatarios.');
  }

  return {
    id: notification.id,
    created_at: notification.created_at,
    recipients: rows.length,
  };
};

const listNotifications = async ({
  userId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  category,
  search = '',
  unreadOnly = false,
}) => {
  if (!userId) {
    throw AppError.unauthorized('No se pudo identificar al usuario.');
  }
  const supabase = getSupabaseAdmin();

  const safePage = normalizePage(page);
  const safePageSize = normalizePageSize(pageSize);
  const safeCategory = normalizeCategory(category);
  const term = typeof search === 'string' ? search.trim().toLowerCase() : '';
  const onlyUnread = normalizeBool(unreadOnly, false);

  const { data, error } = await supabase
    .from('notificaciones_recipiente')
    .select(
      `
      id_notification,
      is_read,
      read_at,
      notification:notificaciones (
        id,
        title,
        body,
        category,
        trigger_type,
        id_pedido,
        id_evento,
        created_by,
        created_at
      )
    `
    )
    .eq('id_user', userId)
    .order('id_notification', { ascending: false });

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron obtener las notificaciones.');
  }

  const filtered = (data || []).filter((row) => {
    if (!row.notification) return false;
    if (onlyUnread && row.is_read) return false;
    if (safeCategory && row.notification.category !== safeCategory) return false;
    if (term) {
      const haystack = `${row.notification.title} ${row.notification.body} ${row.notification.trigger_type || ''}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;

  const creatorIds = Array.from(
    new Set(
      filtered
        .map((row) => row.notification?.created_by)
        .filter((id) => typeof id === 'string' && id.length > 0),
    ),
  );

  const creatorMap = new Map();
  if (creatorIds.length) {
    const { data: perfiles } = await supabase
      .from('perfil')
      .select('id, nombre')
      .in('id', creatorIds);
    (perfiles || []).forEach((p) => {
      if (p?.id) creatorMap.set(p.id, p.nombre ?? null);
    });
  }

  const items = filtered.slice(start, end).map((row) => ({
    id: row.notification.id,
    title: row.notification.title,
    body: row.notification.body,
    category: row.notification.category,
    trigger_type: row.notification.trigger_type,
    id_pedido: row.notification.id_pedido,
    id_evento: row.notification.id_evento,
    created_by: row.notification.created_by,
    created_by_name: creatorMap.get(row.notification.created_by) ?? null,
    created_at: row.notification.created_at,
    is_read: row.is_read,
    read_at: row.read_at,
  }));

  const unreadCount = (data || []).reduce((acc, row) => (!row.is_read ? acc + 1 : acc), 0);

  return {
    data: items,
    total,
    totalPages,
    currentPage: safePage,
    pageSize: safePageSize,
    unreadCount,
  };
};

const markNotificationRead = async ({ userId, notificationId, read = true }) => {
  if (!userId) {
    throw AppError.unauthorized('No se pudo identificar al usuario.');
  }

  const id = Number(notificationId);
  if (!Number.isFinite(id)) {
    throw AppError.badRequest('notificationId invalido.');
  }

  const update = {
    is_read: !!read,
    read_at: read ? new Date().toISOString() : null,
  };

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('notificaciones_recipiente')
    .update(update)
    .eq('id_notification', id)
    .eq('id_user', userId)
    .select('id_notification, is_read, read_at')
    .single();

  if (error) {
    throw fromSupabaseError(error, 'No se pudo actualizar la notificacion.');
  }

  return data;
};

const markAllNotificationsRead = async (userId) => {
  if (!userId) {
    throw AppError.unauthorized('No se pudo identificar al usuario.');
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('notificaciones_recipiente')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id_user', userId)
    .eq('is_read', false)
    .select('id_notification');

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron marcar las notificaciones.');
  }

  return { updated: (data || []).length };
};

module.exports = {
  listNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
};
