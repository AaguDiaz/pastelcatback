const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const { getClientes } = require('../services/clienteservice');

const parseIsActive = (value) => {
  if (value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return null;
};

router.get('/', authenticateToken, requirePermissions(PERMISSIONS.USUARIO.VER), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search = '' } = req.query;
    const rawIsActive = req.query.is_active ?? req.query.activo;
    const result = await getClientes({
      isActive: parseIsActive(rawIsActive),
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
