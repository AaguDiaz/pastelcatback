const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const { listPermisos } = require('../services/permisoservice');

const router = express.Router();

router.use(authenticateToken);

router.get('/', requirePermissions(PERMISSIONS.USUARIO.MODIFICAR), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 50, search = '' } = req.query;
    const result = await listPermisos({ page, pageSize, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
