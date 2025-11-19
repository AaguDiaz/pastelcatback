const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const {
  getCategorias,
  createCategoria,
  updateCategoria,
  deleteCategoria,
} = require('../services/categoriaservice');

router.use(authenticateToken);

const parseNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

router.get('/', requirePermissions(PERMISSIONS.ARTICULOS.VER), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, search = '' } = req.query;
    const result = await getCategorias({
      page: parseNumber(page, 1),
      pageSize: parseNumber(pageSize, 20),
      search,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermissions(PERMISSIONS.ARTICULOS.AGREGAR), async (req, res, next) => {
  try {
    const categoria = await createCategoria(req.body);
    res.status(201).json(categoria);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requirePermissions(PERMISSIONS.ARTICULOS.MODIFICAR), async (req, res, next) => {
  try {
    const categoria = await updateCategoria(req.params.id, req.body);
    res.json(categoria);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.ARTICULOS.ELIMINAR), async (req, res, next) => {
  try {
    await deleteCategoria(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
