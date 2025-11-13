const supabase = require('../config/supabase');
const { AppError, fromSupabaseError } = require('../utils/errors');
const { getCachedPermissions, savePermissionsToCache } = require('../utils/permissionsCache');

const normalizeSlugs = (slugs) =>
  slugs
    .flat()
    .filter(Boolean)
    .map((slug) => String(slug).toLowerCase());

const fetchUserPermissionSlugs = async (userId) => {
  const slugSet = new Set();
  if (!userId) {
    return slugSet;
  }

  const permIds = new Set();

  const { data: directPerms, error: directError } = await supabase
    .from('usuario_permiso')
    .select('id_permiso')
    .eq('id_usuario', userId);

  if (directError) {
    throw fromSupabaseError(directError, 'No se pudieron obtener los permisos directos del usuario.');
  }

  (directPerms || []).forEach((row) => {
    if (Number.isFinite(row.id_permiso)) {
      permIds.add(row.id_permiso);
    }
  });

  const { data: grupos, error: gruposError } = await supabase
    .from('usuario_grupo')
    .select('id_grupo')
    .eq('id_usuario', userId);

  if (gruposError) {
    throw fromSupabaseError(gruposError, 'No se pudieron obtener los grupos del usuario.');
  }

  const groupIds = (grupos || [])
    .map((row) => row.id_grupo)
    .filter((id) => Number.isFinite(id));

  if (groupIds.length) {
    const { data: grupoPerms, error: grupoPermsError } = await supabase
      .from('grupo_permisos')
      .select('id_permisos')
      .in('id_grupo', groupIds);

    if (grupoPermsError) {
      throw fromSupabaseError(grupoPermsError, 'No se pudieron obtener los permisos de los grupos.');
    }

    (grupoPerms || []).forEach((row) => {
      if (Number.isFinite(row.id_permisos)) {
        permIds.add(row.id_permisos);
      }
    });
  }

  if (!permIds.size) {
    return slugSet;
  }

  const { data: permisos, error: permisosError } = await supabase
    .from('permisos')
    .select('id_permisos, slug')
    .in('id_permisos', Array.from(permIds));

  if (permisosError) {
    throw fromSupabaseError(permisosError, 'No se pudieron obtener los slugs de permisos.');
  }

  (permisos || []).forEach((permiso) => {
    if (permiso?.slug) {
      slugSet.add(String(permiso.slug).toLowerCase());
    }
  });

  return slugSet;
};

const loadPermissionsForRequest = async (req) => {
  if (req.userPermissions instanceof Set) {
    return req.userPermissions;
  }

  const userId = req.user?.sub;
  if (!userId) {
    throw AppError.unauthorized('No se pudo identificar al usuario.');
  }

  const cached = getCachedPermissions(userId);
  if (cached) {
    req.userPermissions = cached;
    return cached;
  }

  const slugs = await fetchUserPermissionSlugs(userId);
  savePermissionsToCache(userId, slugs);
  req.userPermissions = slugs;
  return slugs;
};

const requirePermissions = (...required) => {
  const normalized = normalizeSlugs(required);
  if (!normalized.length) {
    return (req, res, next) => next();
  }

  return async (req, res, next) => {
    try {
      const userSlugs = await loadPermissionsForRequest(req);
      const missing = normalized.filter((slug) => !userSlugs.has(slug));
      if (missing.length) {
        return next(AppError.forbidden('No tenes permisos para realizar esta accion.'));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

module.exports = {
  requirePermissions,
};
