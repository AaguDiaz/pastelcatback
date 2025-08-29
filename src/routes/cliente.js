const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getClientes } = require('../services/clienteservice');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { activo, page = 1, pageSize = 10, search = '' } = req.query;
    const result = await getClientes({
      activo: activo !== undefined ? activo === 'true' : null,
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