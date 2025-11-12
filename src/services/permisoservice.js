const supabase = require('../config/supabase');
const { AppError, fromSupabaseError } = require('../utils/errors');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

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

const slugSegment = (value) => sanitizeString(value).toLowerCase().replace(/[\s]+/g, '-');

const buildSlug = (modulo, accion) => {
  const safeModulo = slugSegment(modulo);
  const safeAccion = slugSegment(accion);

  if (!safeModulo || !safeAccion) {
    throw AppError.badRequest('Modulo y accion son obligatorios.');
  }

  return `${safeModulo}:${safeAccion}`;
};

const formatPermiso = (permiso) => ({
  id_permiso: permiso.id_permisos ?? permiso.id_permiso ?? permiso.id,
  modulo: permiso.modulo,
  accion: permiso.accion,
  slug: permiso.slug,
  created_at: permiso.created_at ?? null,
});

const fetchPermisoRow = async (idPermiso) => {
  const { data, error } = await supabase
    .from('permisos')
    .select('*')
    .eq('id_permisos', idPermiso)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('Permiso no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo obtener el permiso solicitado.');
  }

  return data;
};

const ensureSlugUnique = async (slug, excludeId = null) => {
  let query = supabase.from('permisos').select('id_permisos', { head: false }).eq('slug', slug).limit(1);
  if (excludeId) {
    query = query.neq('id_permisos', excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw fromSupabaseError(error, 'No se pudo validar el slug del permiso.');
  }

  if (Array.isArray(data) && data.length > 0) {
    throw AppError.conflict('Ya existe un permiso con ese slug.');
  }
};

const listPermisos = async ({ page = 1, pageSize = DEFAULT_PAGE_SIZE, search = '' } = {}) => {
  const safePage = normalizePage(page);
  const safePageSize = normalizePageSize(pageSize);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize - 1;

  let query = supabase
    .from('permisos')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(start, end);

  const safeSearch = sanitizeString(search);
  if (safeSearch) {
    const pattern = `%${safeSearch}%`;
    query = query.or(`modulo.ilike.${pattern},accion.ilike.${pattern},slug.ilike.${pattern}`);
  }

  const { data, error, count } = await query;

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron listar los permisos.');
  }

  const items = (data || []).map(formatPermiso);

  return {
    data: items,
    totalPages: Math.ceil((count || 0) / safePageSize),
    currentPage: safePage,
    pageSize: safePageSize,
    totalItems: count || 0,
  };
};

const getPermisoById = async (idPermiso) => {
  const permiso = await fetchPermisoRow(idPermiso);
  return formatPermiso(permiso);
};

const createPermiso = async ({ modulo, accion }) => {
  const safeModulo = sanitizeString(modulo);
  const safeAccion = sanitizeString(accion);

  if (!safeModulo || !safeAccion) {
    throw AppError.badRequest('Modulo y accion son obligatorios.');
  }

  const slug = buildSlug(safeModulo, safeAccion);
  await ensureSlugUnique(slug);

  const { data, error } = await supabase
    .from('permisos')
    .insert({ modulo: safeModulo, accion: safeAccion, slug })
    .select('*')
    .single();

  if (error) {
    throw fromSupabaseError(error, 'No se pudo crear el permiso.');
  }

  return formatPermiso(data);
};

const updatePermiso = async (idPermiso, { modulo, accion }) => {
  const updates = {};

  if (modulo !== undefined) {
    const safeModulo = sanitizeString(modulo);
    if (!safeModulo) {
      throw AppError.badRequest('El modulo no puede estar vacio.');
    }
    updates.modulo = safeModulo;
  }

  if (accion !== undefined) {
    const safeAccion = sanitizeString(accion);
    if (!safeAccion) {
      throw AppError.badRequest('La accion no puede estar vacia.');
    }
    updates.accion = safeAccion;
  }

  if (!Object.keys(updates).length) {
    throw AppError.badRequest('No se proporcionaron datos para actualizar.');
  }

  const current = await fetchPermisoRow(idPermiso);
  const nextModulo = updates.modulo ?? current.modulo;
  const nextAccion = updates.accion ?? current.accion;
  const nextSlug = buildSlug(nextModulo, nextAccion);

  if (nextSlug !== current.slug) {
    await ensureSlugUnique(nextSlug, idPermiso);
    updates.slug = nextSlug;
  }

  const { data, error } = await supabase
    .from('permisos')
    .update(updates)
    .eq('id_permisos', idPermiso)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('Permiso no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo actualizar el permiso.');
  }

  return formatPermiso(data);
};

const ensurePermisoSinUso = async (idPermiso) => {
  const { count: groupCount, error: groupError } = await supabase
    .from('grupo_permisos')
    .select('*', { count: 'exact', head: true })
    .eq('id_permisos', idPermiso);

  if (groupError) {
    throw fromSupabaseError(groupError, 'No se pudo verificar el uso del permiso en grupos.');
  }

  if ((groupCount ?? 0) > 0) {
    throw AppError.conflict('No se puede eliminar: el permiso pertenece a uno o mas grupos.');
  }

  const { count: userCount, error: userError } = await supabase
    .from('usuario_permiso')
    .select('*', { count: 'exact', head: true })
    .eq('id_permiso', idPermiso);

  if (userError) {
    throw fromSupabaseError(userError, 'No se pudo verificar el uso del permiso en usuarios.');
  }

  if ((userCount ?? 0) > 0) {
    throw AppError.conflict('No se puede eliminar: el permiso esta asignado a usuarios.');
  }
};

const deletePermiso = async (idPermiso) => {
  await fetchPermisoRow(idPermiso);
  await ensurePermisoSinUso(idPermiso);

  const { error } = await supabase.from('permisos').delete().eq('id_permisos', idPermiso);

  if (error) {
    throw fromSupabaseError(error, 'No se pudo eliminar el permiso.');
  }
};

module.exports = {
  listPermisos,
  getPermisoById,
  createPermiso,
  updatePermiso,
  deletePermiso,
};
