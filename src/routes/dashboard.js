const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const { AppError } = require('../utils/errors');
const { getDashboardData } = require('../services/dashboardservice');

router.get('/', authenticateToken, requirePermissions(PERMISSIONS.REPORTES.VER), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const data = await getDashboardData({ startDate, endDate });
    res.json(data);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
      });
    }

    console.error('[dashboard] Error generando datos', err);
    return res.status(500).json({ error: 'Error al generar el dashboard' });
  }
});

module.exports = router;
