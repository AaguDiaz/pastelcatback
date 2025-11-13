const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { AppError } = require('../utils/errors');
const {
  listGrupos,
  getGrupoById,
  createGrupo,
  updateGrupo,
  deleteGrupo,
  listPermisosDeGrupo,
  addPermisoToGrupo,
  removePermisoFromGrupo,
} = require('../services/gruposervice');

const router = express.Router();

const parseGrupoId = (raw) => {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw AppError.badRequest('El identificador del grupo es invalido.');
  }
  return id;
};

const parsePermisoId = (raw) => {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw AppError.badRequest('El identificador del permiso es invalido.');
  }
  return id;
};

router.use(authenticateToken);

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, search = '' } = req.query;
    const result = await listGrupos({ page, pageSize, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const grupo = await createGrupo(req.body || {});
    res.status(201).json(grupo);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const idGrupo = parseGrupoId(req.params.id);
    const includePermisos = String(req.query.includePermissions || 'true').toLowerCase() !== 'false';
    const grupo = await getGrupoById(idGrupo, { includePermisos });
    res.json(grupo);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const idGrupo = parseGrupoId(req.params.id);
    const grupo = await updateGrupo(idGrupo, req.body || {});
    res.json(grupo);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const idGrupo = parseGrupoId(req.params.id);
    await deleteGrupo(idGrupo);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/:id/permisos', async (req, res, next) => {
  try {
    const idGrupo = parseGrupoId(req.params.id);
    const permisos = await listPermisosDeGrupo(idGrupo);
    res.json({ id_grupo: idGrupo, permisos });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/permisos', async (req, res, next) => {
  try {
    const idGrupo = parseGrupoId(req.params.id);
    const idPermiso = parsePermisoId(req.body?.id_permiso ?? req.body?.idPermiso);
    const resultado = await addPermisoToGrupo(idGrupo, idPermiso);
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/permisos/:permisoId', async (req, res, next) => {
  try {
    const idGrupo = parseGrupoId(req.params.id);
    const idPermiso = parsePermisoId(req.params.permisoId);
    await removePermisoFromGrupo(idGrupo, idPermiso);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
