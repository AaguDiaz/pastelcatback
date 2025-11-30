const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const {
  getPedidos,
  getPedidoById,
  getPedidoByIdFull,
  createPedido,
  updatePedido,
  updateEstado,
  deletePedido,
} = require('../services/pedidoservice');

router.get('/', authenticateToken, requirePermissions(PERMISSIONS.PEDIDOS.VER), async (req, res) => {
  try {
    const { page = 1, estado } = req.query;
    const result = await getPedidos(parseInt(page), estado || null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticateToken, requirePermissions(PERMISSIONS.PEDIDOS.VER), async (req, res) => {
  try {
    const pedido = await getPedidoById(req.params.id);
    res.json(pedido);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get('/:id/completo', authenticateToken, requirePermissions(PERMISSIONS.PEDIDOS.VER), async (req, res) => {
  try {
    const pedido = await getPedidoByIdFull(req.params.id);
    res.json(pedido);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/', authenticateToken, requirePermissions(PERMISSIONS.PEDIDOS.AGREGAR), async (req, res) => {
  try {
    const pedido = await createPedido(req.body, req.user?.sub || null);
    res.status(201).json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authenticateToken, requirePermissions(PERMISSIONS.PEDIDOS.MODIFICAR), async (req, res) => {
  try {
    const pedido = await updatePedido(req.params.id, req.body, req.user?.sub || null);
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/estado', authenticateToken, requirePermissions(PERMISSIONS.PEDIDOS.MODIFICAR), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const id_estado = Number(req.body?.id_estado);

    if (!Number.isInteger(id) || ![1, 2, 3, 4].includes(id_estado)) {
    return res.status(400).json({ error: 'Parámetros inválidos (id o id_estado)' });
    }

    const pedido = await updateEstado(id, id_estado, req.user?.sub || null);
    res.json(pedido);
    } catch (err) {
    res.status(400).json({ error: err.message });
    }
  });

router.delete('/:id', authenticateToken, requirePermissions(PERMISSIONS.PEDIDOS.ELIMINAR), async (req, res) => {
    try {
    const pedido = await deletePedido(req.params.id);
    res.json(pedido);
    } catch (err) {
    res.status(400).json({ error: err.message });
    }
});

module.exports = router;
