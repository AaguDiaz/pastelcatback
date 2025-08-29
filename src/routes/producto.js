const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getProductos } = require('../services/productoservice');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { tipo, page = 1, pageSize = 6, search = '' } = req.query;
    if (!tipo) {
      return res.status(400).json({ error: 'Tipo de producto requerido' });
    }
    const result = await getProductos({
      tipo,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      search,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;