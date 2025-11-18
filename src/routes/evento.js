const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const {
  getEventos,
  getEventoById,
  getEventoByIdFull,
  createEvento,
  updateEvento,
  updateEstadoEvento,
  deleteEvento,
} = require('../services/eventoservice');

router.get('/', authenticateToken, requirePermissions(PERMISSIONS.EVENTOS.VER), async (req, res) => {
  try {
    const { page = 1, estado } = req.query;
    const result = await getEventos(parseInt(page, 10) || 1, estado || null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticateToken, requirePermissions(PERMISSIONS.EVENTOS.VER), async (req, res) => {
  try {
    const evento = await getEventoById(req.params.id);
    res.json(evento);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get('/:id/completo', authenticateToken, requirePermissions(PERMISSIONS.EVENTOS.VER), async (req, res) => {
  try {
    const evento = await getEventoByIdFull(req.params.id);
    res.json(evento);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/', authenticateToken, requirePermissions(PERMISSIONS.EVENTOS.AGREGAR), async (req, res) => {
  try {
    const evento = await createEvento(req.body);
    res.status(201).json(evento);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authenticateToken, requirePermissions(PERMISSIONS.EVENTOS.MODIFICAR), async (req, res) => {
  try {
    const evento = await updateEvento(req.params.id, req.body);
    res.json(evento);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/estado', authenticateToken, requirePermissions(PERMISSIONS.EVENTOS.MODIFICAR), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const id_estado = Number(req.body?.id_estado);

    if (!Number.isInteger(id) || ![1, 2, 3, 4].includes(id_estado)) {
      return res.status(400).json({ error: 'Parámetros inválidos (id o id_estado)' });
    }

    const evento = await updateEstadoEvento(id, id_estado);
    return res.json(evento);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authenticateToken, requirePermissions(PERMISSIONS.EVENTOS.ELIMINAR), async (req, res) => {
  try {
    const evento = await deleteEvento(req.params.id);
    res.json(evento);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
