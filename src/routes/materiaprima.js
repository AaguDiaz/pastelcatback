const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth'); 
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const {
  getMateriasPrimas,
  createMateriaPrima,
  updateMateriaPrima,
  deleteMateriaPrima,
} = require('../services/materiaprimaservice');

router.get('/', authenticateToken, requirePermissions(PERMISSIONS.MATERIA_PRIMA.VER), async (req, res) => {
  try {
    const { page = 1, search = '' } = req.query;
    const result = await getMateriasPrimas(parseInt(page), search);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, requirePermissions(PERMISSIONS.MATERIA_PRIMA.AGREGAR), async (req, res) => {
  try {
    const data = await createMateriaPrima(req.body);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authenticateToken, requirePermissions(PERMISSIONS.MATERIA_PRIMA.MODIFICAR), async (req, res) => {
  try {
    const data = await updateMateriaPrima(req.params.id, req.body);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authenticateToken, requirePermissions(PERMISSIONS.MATERIA_PRIMA.ELIMINAR), async (req, res) => {
  try {
    await deleteMateriaPrima(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
