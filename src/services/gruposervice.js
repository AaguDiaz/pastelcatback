const supabase = require('../config/supabase');
const { AppError, fromSupabaseError } = require('../utils/errors');
const { getPermisoById } = require('./permisoservice');

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

const formatGrupo = (grupo) => ({
  id_grupo: grupo.id_grupo,
  nombre: grupo.nombre,
  descripcion: grupo.descripcion ?? null,
  created_at: grupo.created_at ?? null,
});

const formatPermisoLite = (permiso) => ({
  id_permiso: permiso.id_permisos ?? permiso.id_permiso ?? permiso.id,
  modulo: permiso.modulo,
  accion: permiso.accion,
  slug: permiso.slug,
  created_at: permiso.created_at ?? null,
});

const fetchGrupoRow = async (idGrupo) => {
  const { data, error } = await supabase
    .from('grupos')
    .select('*')
    .eq('id_grupo', idGrupo)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('Grupo no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo obtener el grupo solicitado.');
  }

  return data;
};

const ensureNombreUnique = async (nombre, excludeId = null) => {
  let query = supabase.from('grupos').select('id_grupo', { head: false }).eq('nombre', nombre).limit(1);
  if (excludeId) {
    query = query.neq('id_grupo', excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw fromSupabaseError(error, 'No se pudo validar el nombre del grupo.');
  }

  if (Array.isArray(data) && data.length > 0) {
    throw AppError.conflict('Ya existe un grupo con ese nombre.');
  }
};

const listGrupos = async ({ page = 1, pageSize = DEFAULT_PAGE_SIZE, search = '' } = {}) => {
  const safePage = normalizePage(page);
  const safePageSize = normalizePageSize(pageSize);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize - 1;

  let query = supabase
    .from('grupos')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(start, end);

  const safeSearch = sanitizeString(search);
  if (safeSearch) {
    const pattern = `%${safeSearch}%`;
    query = query.or(`nombre.ilike.${pattern},descripcion.ilike.${pattern}`);
  }

  const { data, error, count } = await query;

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron listar los grupos.');
  }

  const items = (data || []).map(formatGrupo);

  return {
    data: items,
    totalPages: Math.ceil((count || 0) / safePageSize),
    currentPage: safePage,
    pageSize: safePageSize,
    totalItems: count || 0,
  };
};

const listPermisosDeGrupo = async (idGrupo) => {
  const { data, error } = await supabase
    .from('grupo_permisos')
    .select('id_grupo_permiso, id_permisos')
    .eq('id_grupo', idGrupo);

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron obtener los permisos del grupo.');
  }

  const permIds = (data || [])
    .map((item) => item.id_permisos)
    .filter((id) => id !== null && id !== undefined);
  if (!permIds.length) {
    return [];
  }

  const { data: permisos, error: permisosError } = await supabase
    .from('permisos')
    .select('*')
    .in('id_permisos', permIds);

  if (permisosError) {
    throw fromSupabaseError(permisosError, 'No se pudieron obtener los datos de los permisos asignados.');
  }

  const permisoMap = new Map(
    (permisos || []).map((permiso) => {
      const key = permiso.id_permisos ?? permiso.id_permiso ?? permiso.id;
      return [String(key), formatPermisoLite(permiso)];
    }),
  );

  return (data || [])
    .map((link) => {
      const permiso = permisoMap.get(String(link.id_permisos));
      if (!permiso) return null;
      return {
        id_grupo_permiso: link.id_grupo_permiso,
        ...permiso,
      };
    })
    .filter(Boolean);
};

const getGrupoById = async (idGrupo, { includePermisos = true } = {}) => {
  const grupo = await fetchGrupoRow(idGrupo);
  const payload = {
    ...formatGrupo(grupo),
  };

  if (includePermisos) {
    payload.permisos = await listPermisosDeGrupo(idGrupo);
  }

  return payload;
};

const createGrupo = async ({ nombre, descripcion = null }) => {
  const safeNombre = sanitizeString(nombre);
  if (!safeNombre) {
    throw AppError.badRequest('El nombre del grupo es obligatorio.');
  }

  const safeDescripcion = descripcion !== undefined ? sanitizeString(descripcion) || null : null;

  await ensureNombreUnique(safeNombre);

  const { data, error } = await supabase
    .from('grupos')
    .insert({ nombre: safeNombre, descripcion: safeDescripcion })
    .select('*')
    .single();

  if (error) {
    throw fromSupabaseError(error, 'No se pudo crear el grupo.');
  }

  return formatGrupo(data);
};

const updateGrupo = async (idGrupo, { nombre, descripcion }) => {
  const updates = {};

  if (nombre !== undefined) {
    const safeNombre = sanitizeString(nombre);
    if (!safeNombre) {
      throw AppError.badRequest('El nombre del grupo no puede estar vacio.');
    }
    await ensureNombreUnique(safeNombre, idGrupo);
    updates.nombre = safeNombre;
  }

  if (descripcion !== undefined) {
    updates.descripcion = sanitizeString(descripcion) || null;
  }

  if (!Object.keys(updates).length) {
    throw AppError.badRequest('No se proporcionaron datos para actualizar.');
  }

  const { data, error } = await supabase
    .from('grupos')
    .update(updates)
    .eq('id_grupo', idGrupo)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('Grupo no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo actualizar el grupo.');
  }

  return formatGrupo(data);
};

const ensureGrupoSinUsuarios = async (idGrupo) => {
  const { count: userCount, error: userError } = await supabase
    .from('usuario_grupo')
    .select('*', { count: 'exact', head: true })
    .eq('id_grupo', idGrupo);

  if (userError) {
    throw fromSupabaseError(userError, 'No se pudo verificar si el grupo tiene usuarios asociados.');
  }

  if ((userCount ?? 0) > 0) {
    throw AppError.conflict('No se puede eliminar: hay usuarios asignados a este grupo.');
  }
};

const deleteGrupo = async (idGrupo) => {
  await fetchGrupoRow(idGrupo);
  await ensureGrupoSinUsuarios(idGrupo);

  const { error: pivotError } = await supabase.from('grupo_permisos').delete().eq('id_grupo', idGrupo);
  if (pivotError) {
    throw fromSupabaseError(pivotError, 'No se pudieron eliminar los permisos del grupo.');
  }

  const { error } = await supabase.from('grupos').delete().eq('id_grupo', idGrupo);
  if (error) {
    throw fromSupabaseError(error, 'No se pudo eliminar el grupo.');
  }
};

const addPermisoToGrupo = async (idGrupo, idPermiso) => {
  await fetchGrupoRow(idGrupo);
  const permiso = await getPermisoById(idPermiso);

  const { data: existing, error: existingError } = await supabase
    .from('grupo_permisos')
    .select('id_grupo_permiso')
    .eq('id_grupo', idGrupo)
    .eq('id_permisos', idPermiso)
    .limit(1);

  if (existingError) {
    throw fromSupabaseError(existingError, 'No se pudo validar la asignacion del permiso.');
  }

  if (Array.isArray(existing) && existing.length > 0) {
    throw AppError.conflict('El permiso ya esta asignado al grupo.');
  }

  const { data, error } = await supabase
    .from('grupo_permisos')
    .insert({ id_grupo: idGrupo, id_permisos: idPermiso })
    .select('id_grupo_permiso')
    .single();

  if (error) {
    throw fromSupabaseError(error, 'No se pudo asignar el permiso al grupo.');
  }

  return {
    id_grupo_permiso: data.id_grupo_permiso,
    ...permiso,
  };
};

const removePermisoFromGrupo = async (idGrupo, idPermiso) => {
  const { data, error } = await supabase
    .from('grupo_permisos')
    .delete()
    .eq('id_grupo', idGrupo)
    .eq('id_permisos', idPermiso)
    .select('id_grupo_permiso')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('El permiso no esta asignado al grupo.');
    }
    throw fromSupabaseError(error, 'No se pudo quitar el permiso del grupo.');
  }

  return data;
};

module.exports = {
  listGrupos,
  getGrupoById,
  createGrupo,
  updateGrupo,
  deleteGrupo,
  listPermisosDeGrupo,
  addPermisoToGrupo,
  removePermisoFromGrupo,
};
