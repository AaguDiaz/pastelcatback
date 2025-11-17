const supabase = require('../config/supabase');
const { fromSupabaseError } = require('../utils/errors');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

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

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const formatPermiso = (permiso) => ({
  id_permiso: permiso.id_permisos ?? permiso.id_permiso ?? permiso.id,
  modulo: permiso.modulo,
  accion: permiso.accion,
  slug: permiso.slug,
  descripcion: permiso.descripcion ?? null,
  created_at: permiso.created_at ?? null,
});

const listPermisos = async ({ page = 1, pageSize = DEFAULT_PAGE_SIZE, search = '' } = {}) => {
  const safePage = normalizePage(page);
  const safePageSize = normalizePageSize(pageSize);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize - 1;

  let query = supabase
    .from('permisos')
    .select('*', { count: 'exact' })
    .order('modulo', { ascending: true })
    .order('accion', { ascending: true })
    .range(start, end);

  const safeSearch = sanitizeString(search);
  if (safeSearch) {
    const pattern = `%${safeSearch}%`;
    query = query.or(`modulo.ilike.${pattern},accion.ilike.${pattern},slug.ilike.${pattern}`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron listar los permisos.');
  }

  return {
    data: (data || []).map(formatPermiso),
    totalPages: Math.ceil((count || 0) / safePageSize),
    currentPage: safePage,
    pageSize: safePageSize,
    totalItems: count || 0,
  };
};

module.exports = {
  listPermisos,
};