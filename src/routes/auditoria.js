const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const { AppError } = require('../utils/errors');
const { getAuthEvents, getAuthUsageSummary } = require('../services/auditoriaservice');
const { listHistorialPrecios, getMateriasMasCambiadas } = require('../services/materiaprimaservice');

const AUDIT_PERMISSION = PERMISSIONS.AUDITORIA.VER;

const handleAsync = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }

    console.error('[auditoria] Unexpected error', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrio un error al procesar la auditoria.',
      },
    });
  }
};

router.get(
  '/auth/events',
  authenticateToken,
  requirePermissions(AUDIT_PERMISSION),
  handleAsync(async (req, res) => {
    const { page, pageSize, startDate, endDate, userId, eventTypes } = req.query;
    const data = await getAuthEvents({ page, pageSize, startDate, endDate, userId, eventTypes });
    res.json(data);
  }),
);

router.get(
  '/auth/summary',
  authenticateToken,
  requirePermissions(AUDIT_PERMISSION),
  handleAsync(async (req, res) => {
    const { startDate, endDate, limit } = req.query;
    const data = await getAuthUsageSummary({ startDate, endDate, topLimit: limit });
    res.json(data);
  }),
);

router.get(
  '/materias/historial',
  authenticateToken,
  requirePermissions(AUDIT_PERMISSION),
  handleAsync(async (req, res) => {
    const { page, pageSize, materiaId, startDate, endDate } = req.query;
    const data = await listHistorialPrecios({ page, pageSize, materiaId, startDate, endDate });
    res.json(data);
  }),
);

router.get(
  '/materias/resumen',
  authenticateToken,
  requirePermissions(AUDIT_PERMISSION),
  handleAsync(async (req, res) => {
    const { startDate, endDate, limit } = req.query;
    const data = await getMateriasMasCambiadas({ startDate, endDate, limit });
    res.json(data);
  }),
);

module.exports = router;
