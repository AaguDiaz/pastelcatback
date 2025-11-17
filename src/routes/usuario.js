const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const { AppError } = require('../utils/errors');
const {
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
  promoteClienteToAdministrador,
} = require('../services/usuarioservice');

const router = express.Router();

const parseIsActive = (value) => {
  if (value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  if (['all', 'todos', 'cualquiera'].includes(normalized)) return null;
  throw AppError.badRequest('El parametro is_active es invalido.');
};

const parseIdPerfil = (raw) => {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw AppError.badRequest('El identificador de usuario es invalido.');
  }
  return id;
};

const parseIdGrupo = (raw) => {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw AppError.badRequest('El identificador del grupo es invalido.');
  }
  return id;
};

const parseIdPermiso = (raw) => {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw AppError.badRequest('El identificador del permiso es invalido.');
  }
  return id;
};

router.use(authenticateToken);

router.get('/', requirePermissions(PERMISSIONS.USUARIO.VER), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, search = '', is_active } = req.query;
    const isActiveFilter = parseIsActive(is_active);

    const result = await listUsuarios({
      page,
      pageSize,
      search,
      isActive: isActiveFilter,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermissions(PERMISSIONS.USUARIO.AGREGAR), async (req, res, next) => {
  try {
    const usuario = await createUsuarioLogueable(req.body || {});
    res.status(201).json(usuario);
  } catch (err) {
    next(err);
  }
});

router.post('/cliente', requirePermissions(PERMISSIONS.USUARIO.AGREGAR), async (req, res, next) => {
  try {
    const cliente = await createClienteSinLogin(req.body || {});
    res.status(201).json(cliente);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/grupos', requirePermissions(PERMISSIONS.USUARIO.MODIFICAR), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const resultado = await listGruposDeUsuario(idPerfil);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/grupos', requirePermissions(PERMISSIONS.USUARIO.MODIFICAR), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const idGrupo = parseIdGrupo(req.body?.id_grupo ?? req.body?.idGrupo);
    const resultado = await assignGrupoToUsuario(idPerfil, idGrupo);
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/grupos/:idGrupo', requirePermissions(PERMISSIONS.USUARIO.MODIFICAR), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const idGrupo = parseIdGrupo(req.params.idGrupo);
    const resultado = await removeGrupoFromUsuario(idPerfil, idGrupo);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/permisos', requirePermissions(PERMISSIONS.USUARIO.MODIFICAR), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const resultado = await listPermisosDirectosDeUsuario(idPerfil);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/permisos', requirePermissions(PERMISSIONS.USUARIO.MODIFICAR), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const idPermiso = parseIdPermiso(req.body?.id_permiso ?? req.body?.idPermiso);
    const resultado = await assignPermisoDirectoAUsuario(idPerfil, idPermiso);
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/permisos/:idPermiso', requirePermissions(PERMISSIONS.USUARIO.MODIFICAR), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const idPermiso = parseIdPermiso(req.params.idPermiso);
    const resultado = await removePermisoDirectoDeUsuario(idPerfil, idPermiso);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/promover', requirePermissions(PERMISSIONS.USUARIO.MODIFICAR), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const usuario = await promoteClienteToAdministrador(idPerfil, req.body || {});
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermissions(PERMISSIONS.USUARIO.VER), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const usuario = await getUsuarioById(idPerfil);
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requirePermissions(PERMISSIONS.USUARIO.MODIFICAR), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const usuario = await updateUsuario(idPerfil, req.body || {});
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.USUARIO.ELIMINAR), async (req, res, next) => {
  try {
    const idPerfil = parseIdPerfil(req.params.id);
    const usuario = await softDeleteUsuario(idPerfil);
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
