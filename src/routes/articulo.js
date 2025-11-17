const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const {
  getArticulos,
  createArticulo,
  updateArticulo,
  deleteArticulo,
} = require('../services/articuloservice');

router.use(authenticateToken);

const parseNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

router.get('/', requirePermissions(PERMISSIONS.ARTICULOS.VER), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, search = '', categoriaId } = req.query;
    const result = await getArticulos({
      page: parseNumber(page, 1),
      pageSize: parseNumber(pageSize, 10),
      search,
      categoriaId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermissions(PERMISSIONS.ARTICULOS.AGREGAR), async (req, res, next) => {
  try {
    const articulo = await createArticulo(req.body);
    res.status(201).json(articulo);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requirePermissions(PERMISSIONS.ARTICULOS.MODIFICAR), async (req, res, next) => {
  try {
    const articulo = await updateArticulo(req.params.id, req.body);
    res.json(articulo);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.ARTICULOS.ELIMINAR), async (req, res, next) => {
  try {
    const result = await deleteArticulo(req.params.id);
    if (result.action === 'DELETED') {
      return res.status(204).send();
    }
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
