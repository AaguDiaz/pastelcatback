const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const {
  obtenerTortas,
  obtenerMateriasPrimas,
  createReceta,
  getRecetas,
  getIngredientesReceta,
  getRecetaCompletaPorTorta,
  updateReceta,
  deleteReceta,
} = require('../services/recetaservice')
const { sendError } = require('../utils/errors');

// GET /tortas
router.get('/tortas', authenticateToken, requirePermissions(PERMISSIONS.RECETAS.VER), async (req, res) => {
  try {
    const tortas = await obtenerTortas()
    res.json(tortas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener tortas' })
  }
})

// GET /ingredientes
router.get('/ingredientes', authenticateToken, requirePermissions(PERMISSIONS.RECETAS.VER), async (req, res) => {
  try {
    const ingredientes = await obtenerMateriasPrimas()
    res.json(ingredientes)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener ingredientes' })
  }
})

router.post('/', authenticateToken, requirePermissions(PERMISSIONS.RECETAS.AGREGAR), async (req, res) => {
  try {
    const { id_torta, porciones, ingredientes } = req.body;

    if (!id_torta || !porciones || !ingredientes || ingredientes.length === 0) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para guardar la receta.' });
    }

    const resultado = await createReceta({ id_torta, porciones, ingredientes });

    res.status(200).json({ mensaje: 'Receta guardada correctamente', receta: resultado });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar la receta' });
  }
});

// GET / para obtener todas las recetas para la tabla de gestión
router.get('/', authenticateToken, requirePermissions(PERMISSIONS.RECETAS.VER), async (req, res) => {
  try {
    const recetas = await getRecetas();
    res.json(recetas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las recetas' });
  }
});

// GET /:id/ingredientes para obtener los ingredientes de una receta específica
router.get('/:id/ingredientes', authenticateToken, requirePermissions(PERMISSIONS.RECETAS.VER), async (req, res) => {
  try {
    const { id } = req.params;
    const ingredientes = await getIngredientesReceta(id);
    res.json(ingredientes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los ingredientes de la receta' });
  }
});

// PUT /:id para actualizar una receta
router.put('/:id', authenticateToken, requirePermissions(PERMISSIONS.RECETAS.MODIFICAR), async (req, res) => {
  try {
    const { id } = req.params;
    const { porciones, ingredientes } = req.body;

    if (!porciones || !ingredientes || ingredientes.length === 0) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para actualizar la receta.' });
    }
    
    const resultado = await updateReceta(id, { porciones, ingredientes });
    res.status(200).json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la receta' });
  }
});

// DELETE /:id para eliminar una receta
router.delete('/:id', authenticateToken, requirePermissions(PERMISSIONS.RECETAS.ELIMINAR), async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await deleteReceta(id);
    res.status(200).json(resultado);
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/detalles/torta/:id_torta', authenticateToken, requirePermissions(PERMISSIONS.RECETAS.VER), async (req, res) => {
  try {
    const { id_torta } = req.params;
    const detalles = await getRecetaCompletaPorTorta(id_torta);
    res.json(detalles);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

module.exports = router
