const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getPedidos,
  getPedidoById,
  createPedido,
  updatePedido,
  updateEstado,
} = require('../services/pedidoservice');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, estado } = req.query;
    const result = await getPedidos(parseInt(page), estado || null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pedido = await getPedidoById(req.params.id);
    res.json(pedido);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const pedido = await createPedido(req.body);
    res.status(201).json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const pedido = await updatePedido(req.params.id, req.body);
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { estado } = req.body;
    const pedido = await updateEstado(req.params.id, estado);
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
