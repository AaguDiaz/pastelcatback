const crypto = require('crypto');
const supabase = require('../config/supabase');
const getSupabaseAdmin = require('../config/supabaseAdmin');
const { AppError, fromSupabaseError } = require('../utils/errors');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const RESET_LIFETIME_HOURS = {
  set_password: 72,
  reset: 24,
};

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

const formatGrupoLite = (grupo) => ({
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

const ensureAdminClient = () => {
  try {
    return getSupabaseAdmin();
  } catch (err) {
    throw AppError.internal('No se pudo inicializar el cliente admin de Supabase. Verifica SUPABASE_SERVICE_ROLE_KEY.');
  }
};

const ensureDniUnique = async (dni, excludeId = null) => {
  let query = supabase
    .from('perfil')
    .select('id_perfil', { count: 'exact', head: false })
    .eq('dni', dni)
    .limit(1);

  if (excludeId) {
    query = query.neq('id_perfil', excludeId);
  }

  const { data, error } = await query;

  if (error) {
    throw fromSupabaseError(error, 'No se pudo validar el DNI proporcionado.');
  }

  if (Array.isArray(data) && data.length > 0) {
    throw AppError.conflict('Ya existe un usuario con ese DNI.');
  }
};

const fetchEmailsForProfiles = async (profiles) => {
  const ids = [...new Set((profiles || []).map((perfil) => perfil?.id).filter(Boolean))];
  if (!ids.length) {
    return new Map();
  }

  const supabaseAdmin = ensureAdminClient();
  const map = new Map();

  await Promise.all(
    ids.map(async (userId) => {
      try {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (!error && data?.user) {
          map.set(userId, data.user.email);
        }
      } catch (err) {
        // Ignoramos para no bloquear el listado por un usuario puntual
      }
    }),
  );

  return map;
};

const formatPerfil = (perfil, emailMap) => ({
  id_perfil: perfil.id_perfil,
  user_id: perfil.id ?? null,
  nombre: perfil.nombre,
  dni: perfil.dni,
  telefono: perfil.telefono,
  direccion: perfil.direccion,
  is_active: perfil.is_active,
  has_account: Boolean(perfil.id),
  email: perfil.id ? emailMap?.get(perfil.id) ?? null : null,
  created_at: perfil.created_at ?? null,
  update_at: perfil.update_at ?? perfil.update_at ?? null,
});

const createResetToken = async (userId, tipo) => {
  const lifetimeHours = RESET_LIFETIME_HOURS[tipo] ?? 24;
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + lifetimeHours * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('reset_clave')
    .insert({
      id_usuario: userId,
      token,
      tipo,
      expires_at: expiresAt,
      used: false,
    });

  if (error) {
    throw fromSupabaseError(error, 'No se pudo registrar el token de restablecimiento.');
  }
};

const listUsuarios = async ({ page = 1, pageSize = DEFAULT_PAGE_SIZE, search = '', isActive = true }) => {
  const safePage = normalizePage(page);
  const safePageSize = normalizePageSize(pageSize);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize - 1;

  let query = supabase
    .from('perfil')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(start, end);

  if (typeof isActive === 'boolean') {
    query = query.eq('is_active', isActive);
  }

  const trimmedSearch = sanitizeString(search);
  if (trimmedSearch) {
    query = query.ilike('nombre', `%${trimmedSearch}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw fromSupabaseError(error, 'No se pudo obtener el listado de usuarios.');
  }

  const emailMap = await fetchEmailsForProfiles(data);
  const items = (data || []).map((perfil) => formatPerfil(perfil, emailMap));

  return {
    data: items,
    totalPages: Math.ceil((count || 0) / safePageSize),
    currentPage: safePage,
    pageSize: safePageSize,
    totalItems: count || 0,
  };
};

const getUsuarioById = async (idPerfil) => {
  const { data, error } = await supabase
    .from('perfil')
    .select('*')
    .eq('id_perfil', idPerfil)
    .single();

  if (error) {
    if (error.code === 'PGRST116' || error.message?.includes('multiple rows')) {
      throw AppError.notFound('Usuario no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo obtener el usuario solicitado.');
  }

  const emailMap = await fetchEmailsForProfiles([data]);
  return formatPerfil(data, emailMap);
};

const createUsuarioLogueable = async ({ nombre, dni, email, telefono = null, direccion = null }) => {
  const safeNombre = sanitizeString(nombre);
  const safeDni = sanitizeString(dni);
  const safeEmail = sanitizeString(email).toLowerCase();

  if (!safeNombre || !safeDni || !safeEmail) {
    throw AppError.badRequest('Nombre, DNI y email son obligatorios.');
  }

  await ensureDniUnique(safeDni);

  const supabaseAdmin = ensureAdminClient();

  const { data: createdUser, error: adminError } = await supabaseAdmin.auth.admin.createUser({
    email: safeEmail,
    password: safeDni,
    email_confirm: true,
  });

  if (adminError || !createdUser?.user) {
    throw AppError.conflict(adminError?.message || 'No se pudo crear el usuario autenticable.');
  }

  const userId = createdUser.user.id;

  const { data: perfil, error: perfilError } = await supabase
    .from('perfil')
    .insert({
      id: userId,
      nombre: safeNombre,
      dni: safeDni,
      telefono: telefono ? String(telefono).trim() : null,
      direccion: direccion ? String(direccion).trim() : null,
      is_active: true,
    })
    .select('*')
    .single();

  if (perfilError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw fromSupabaseError(perfilError, 'No se pudo crear el perfil.');
  }

  try {
    await createResetToken(userId, 'set_password');
  } catch (tokenError) {
    await supabase.from('perfil').delete().eq('id_perfil', perfil.id_perfil);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw tokenError;
  }

  const emailMap = new Map([[userId, safeEmail]]);
  return formatPerfil(perfil, emailMap);
};

const createClienteSinLogin = async ({ nombre, dni, telefono = null, direccion = null }) => {
  const safeNombre = sanitizeString(nombre);
  const safeDni = sanitizeString(dni);

  if (!safeNombre || !safeDni) {
    throw AppError.badRequest('Nombre y DNI son obligatorios.');
  }

  await ensureDniUnique(safeDni);

  const { data, error } = await supabase
    .from('perfil')
    .insert({
      id: null,
      nombre: safeNombre,
      dni: safeDni,
      telefono: telefono ? String(telefono).trim() : null,
      direccion: direccion ? String(direccion).trim() : null,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    throw fromSupabaseError(error, 'No se pudo crear el cliente.');
  }

  return formatPerfil(data, new Map());
};

const updateUsuario = async (idPerfil, { nombre, dni, telefono, direccion, is_active }) => {
  const updates = {};

  if (nombre !== undefined) {
    const safeNombre = sanitizeString(nombre);
    if (!safeNombre) {
      throw AppError.badRequest('El nombre no puede estar vacio.');
    }
    updates.nombre = safeNombre;
  }

  if (dni !== undefined) {
    const safeDni = sanitizeString(dni);
    if (!safeDni) {
      throw AppError.badRequest('El DNI no puede estar vacio.');
    }
    await ensureDniUnique(safeDni, idPerfil);
    updates.dni = safeDni;
  }

  if (telefono !== undefined) {
    updates.telefono = telefono ? String(telefono).trim() : null;
  }

  if (direccion !== undefined) {
    updates.direccion = direccion ? String(direccion).trim() : null;
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      throw AppError.badRequest('El campo is_active debe ser booleano.');
    }
    updates.is_active = is_active;
  }

  if (!Object.keys(updates).length) {
    throw AppError.badRequest('No se proporcionaron datos para actualizar.');
  }

  const timestamp = new Date().toISOString();
  updates.update_at = timestamp;
  updates.update_at = timestamp;

  const { data, error } = await supabase
    .from('perfil')
    .update(updates)
    .eq('id_perfil', idPerfil)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('Usuario no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo actualizar el usuario.');
  }

  const emailMap = await fetchEmailsForProfiles([data]);
  return formatPerfil(data, emailMap);
};

const fetchPerfilWithAccount = async (idPerfil) => {
  const { data, error } = await supabase
    .from('perfil')
    .select('id_perfil, id')
    .eq('id_perfil', idPerfil)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('Usuario no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo validar el usuario proporcionado.');
  }

  if (!data.id) {
    throw AppError.badRequest('El usuario no tiene una cuenta logueable para asignar permisos.');
  }

  return data;
};

const ensureGrupoExists = async (idGrupo) => {
  const { data, error } = await supabase
    .from('grupos')
    .select('id_grupo')
    .eq('id_grupo', idGrupo)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('Grupo no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo validar el grupo proporcionado.');
  }

  return data;
};

const ensurePermisoExists = async (idPermiso) => {
  const { data, error } = await supabase
    .from('permisos')
    .select('id_permisos')
    .eq('id_permisos', idPermiso)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('Permiso no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo validar el permiso proporcionado.');
  }

  return data;
};

const listGruposDeUsuario = async (idPerfil) => {
  const perfil = await fetchPerfilWithAccount(idPerfil);

  const { data, error } = await supabase
    .from('usuario_grupo')
    .select('id_grupo')
    .eq('id_usuario', perfil.id);

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron obtener los grupos del usuario.');
  }

  const groupIds = [
    ...new Set(
      (data || [])
        .map((row) => row.id_grupo)
        .filter((id) => id !== null && id !== undefined),
    ),
  ];

  if (!groupIds.length) {
    return { perfil_id: perfil.id_perfil, user_id: perfil.id, grupos: [] };
  }

  const { data: grupos, error: gruposError } = await supabase
    .from('grupos')
    .select('*')
    .in('id_grupo', groupIds);

  if (gruposError) {
    throw fromSupabaseError(gruposError, 'No se pudieron obtener los datos de los grupos.');
  }

  const grupoMap = new Map(grupos.map((grupo) => [grupo.id_grupo, formatGrupoLite(grupo)]));

  return {
    perfil_id: perfil.id_perfil,
    user_id: perfil.id,
    grupos: groupIds.map((id) => grupoMap.get(id)).filter(Boolean),
  };
};

const assignGrupoToUsuario = async (idPerfil, idGrupo) => {
  const perfil = await fetchPerfilWithAccount(idPerfil);
  await ensureGrupoExists(idGrupo);

  const { data: existing, error: existingError } = await supabase
    .from('usuario_grupo')
    .select('id_usuario_grupo')
    .eq('id_usuario', perfil.id)
    .eq('id_grupo', idGrupo)
    .limit(1);

  if (existingError) {
    throw fromSupabaseError(existingError, 'No se pudo validar la asignacion del grupo.');
  }

  if (Array.isArray(existing) && existing.length > 0) {
    throw AppError.conflict('El usuario ya pertenece a ese grupo.');
  }

  const { error } = await supabase.from('usuario_grupo').insert({ id_usuario: perfil.id, id_grupo: idGrupo });

  if (error) {
    throw fromSupabaseError(error, 'No se pudo asignar el grupo al usuario.');
  }

  return listGruposDeUsuario(idPerfil);
};

const removeGrupoFromUsuario = async (idPerfil, idGrupo) => {
  const perfil = await fetchPerfilWithAccount(idPerfil);

  const { error } = await supabase
    .from('usuario_grupo')
    .delete()
    .eq('id_usuario', perfil.id)
    .eq('id_grupo', idGrupo)
    .select('id_usuario_grupo')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('El usuario no pertenece a ese grupo.');
    }
    throw fromSupabaseError(error, 'No se pudo quitar el grupo del usuario.');
  }

  return listGruposDeUsuario(idPerfil);
};

const listPermisosDirectosDeUsuario = async (idPerfil) => {
  const perfil = await fetchPerfilWithAccount(idPerfil);

  const { data, error } = await supabase
    .from('usuario_permiso')
    .select('id_permiso')
    .eq('id_usuario', perfil.id);

  if (error) {
    throw fromSupabaseError(error, 'No se pudieron obtener los permisos del usuario.');
  }

  const permisoIds = [
    ...new Set(
      (data || [])
        .map((row) => row.id_permiso)
        .filter((id) => id !== null && id !== undefined),
    ),
  ];

  if (!permisoIds.length) {
    return { perfil_id: perfil.id_perfil, user_id: perfil.id, permisos: [] };
  }

  const { data: permisos, error: permisosError } = await supabase
    .from('permisos')
    .select('*')
    .in('id_permisos', permisoIds);

  if (permisosError) {
    throw fromSupabaseError(permisosError, 'No se pudieron obtener los datos de los permisos.');
  }

  const permisoMap = new Map(
    permisos.map((permiso) => {
      const key = permiso.id_permisos ?? permiso.id_permiso ?? permiso.id;
      return [String(key), formatPermisoLite(permiso)];
    }),
  );

  return {
    perfil_id: perfil.id_perfil,
    user_id: perfil.id,
    permisos: permisoIds.map((id) => permisoMap.get(String(id))).filter(Boolean),
  };
};

const assignPermisoDirectoAUsuario = async (idPerfil, idPermiso) => {
  const perfil = await fetchPerfilWithAccount(idPerfil);
  await ensurePermisoExists(idPermiso);

  const { data: existing, error: existingError } = await supabase
    .from('usuario_permiso')
    .select('id_usuario_permiso')
    .eq('id_usuario', perfil.id)
    .eq('id_permiso', idPermiso)
    .limit(1);

  if (existingError) {
    throw fromSupabaseError(existingError, 'No se pudo validar la asignacion del permiso.');
  }

  if (Array.isArray(existing) && existing.length > 0) {
    throw AppError.conflict('El usuario ya tiene ese permiso asignado.');
  }

  const { error } = await supabase
    .from('usuario_permiso')
    .insert({ id_usuario: perfil.id, id_permiso: idPermiso });

  if (error) {
    throw fromSupabaseError(error, 'No se pudo asignar el permiso al usuario.');
  }

  return listPermisosDirectosDeUsuario(idPerfil);
};

const removePermisoDirectoDeUsuario = async (idPerfil, idPermiso) => {
  const perfil = await fetchPerfilWithAccount(idPerfil);

  const { error } = await supabase
    .from('usuario_permiso')
    .delete()
    .eq('id_usuario', perfil.id)
    .eq('id_permiso', idPermiso)
    .select('id_usuario_permiso')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('El usuario no tiene ese permiso asignado.');
    }
    throw fromSupabaseError(error, 'No se pudo quitar el permiso del usuario.');
  }

  return listPermisosDirectosDeUsuario(idPerfil);
};

const softDeleteUsuario = async (idPerfil) => {
  const timestamp = new Date().toISOString();

  const { data, error } = await supabase
    .from('perfil')
    .update({
      is_active: false,
      update_at: timestamp,
      update_at: timestamp,
    })
    .eq('id_perfil', idPerfil)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw AppError.notFound('Usuario no encontrado.');
    }
    throw fromSupabaseError(error, 'No se pudo desactivar el usuario.');
  }

  const emailMap = await fetchEmailsForProfiles([data]);
  return formatPerfil(data, emailMap);
};

module.exports = {
  listUsuarios,
  getUsuarioById,
  createUsuarioLogueable,
  createClienteSinLogin,
  updateUsuario,
  softDeleteUsuario,
  listGruposDeUsuario,
  assignGrupoToUsuario,
  removeGrupoFromUsuario,
  listPermisosDirectosDeUsuario,
  assignPermisoDirectoAUsuario,
  removePermisoDirectoDeUsuario,
};
