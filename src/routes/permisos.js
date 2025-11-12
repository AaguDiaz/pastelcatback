const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { AppError } = require('../utils/errors');
const {
  listPermisos,
  getPermisoById,
  createPermiso,
  updatePermiso,
  deletePermiso,
} = require('../services/permisoservice');

const router = express.Router();

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
    const result = await listPermisos({ page, pageSize, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const permiso = await createPermiso(req.body || {});
    res.status(201).json(permiso);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const idPermiso = parsePermisoId(req.params.id);
    const permiso = await getPermisoById(idPermiso);
    res.json(permiso);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const idPermiso = parsePermisoId(req.params.id);
    const permiso = await updatePermiso(idPermiso, req.body || {});
    res.json(permiso);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const idPermiso = parsePermisoId(req.params.id);
    await deletePermiso(idPermiso);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
