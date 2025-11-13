const express = require('express');
const router = express.Router();
const multer = require('multer');

const { authenticateToken } = require('../middleware/auth'); // Middleware de autenticación 
const { requirePermissions } = require('../middleware/permissions');
const PERMISSIONS = require('../utils/permissionSlugs');
const bandejaService = require('../services/bandejaservice'); // Importar el nuevo servicio
const storageService = require('../services/storageservice'); // Importar el servicio de almacenamiento
const upload = multer({storage: multer.memoryStorage()}); // Configuración de multer para manejar archivos

router.get('/', authenticateToken, requirePermissions(PERMISSIONS.BANDEJAS.VER), async (req, res) => {
  try {
    const { page = 1, search = '' } = req.query;
    const result = await bandejaService.getBandejas(parseInt(page), search);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tortas', authenticateToken, requirePermissions(PERMISSIONS.BANDEJAS.VER), async (req, res) => {
    try {
        const tortas = await bandejaService.getTortasParaBandejas();
        res.json(tortas);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Ocurrió un error al obtener las tortas para bandejas.' });
    }
});

router.get('/:id', authenticateToken, requirePermissions(PERMISSIONS.BANDEJAS.VER), async (req, res) => {
  try {
    const bandeja = await bandejaService.getBandejaDetalles(req.params.id);
    res.json(bandeja);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Ocurrió un error al obtener los detalles de la bandeja.' });
  }
});


router.post('/', authenticateToken, requirePermissions(PERMISSIONS.BANDEJAS.AGREGAR), upload.single('imagen'), async (req, res) => {
  try {
    const { nombre, precio, tamanio, tortas } = req.body;
    if (!nombre || !precio || !tamanio) {
      return res.status(400).json({ error: 'Faltan campos requeridos: nombre, precio o tamaño.' });
    }
    const precioFloat = parseFloat(precio);
    if (isNaN(precioFloat) || precioFloat <= 0) {
        return res.status(400).json({ error: 'El precio no es un número válido o es menor o igual a cero.' });
    }

    let imagenUrl = null;
    if (req.file) {
      imagenUrl = await storageService.uploadImage(req.file, 'bandejas-imagen');
    }

    let tortasEnBandeja = [];
      if (tortas) {
        try {
          tortasEnBandeja = JSON.parse(tortas);
        } catch {
          return res.status(400).json({ error: 'El campo tortas debe ser JSON válido.' });
        }
      }
    const nuevaBandeja = await bandejaService.createBandeja({ nombre, precio: precioFloat, tamanio, imagenUrl }, tortasEnBandeja);

    res.status(201).json(nuevaBandeja);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Ocurrió un error al procesar la solicitud.' });
  }
});

router.put('/:id', authenticateToken, requirePermissions(PERMISSIONS.BANDEJAS.MODIFICAR), upload.single('imagen'), async (req, res) => {
  try {
    console.log('BODY:', req.body);
    console.log('FILE:', req.file);
    console.log('PARAMS:', req.params);

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID de bandeja inválido.' });
    }

    const { nombre, precio, tamanio, tortas } = req.body;

    if (!nombre || !tamanio) {
      return res.status(400).json({ error: 'Faltan campos requeridos: nombre o tamaño.' });
    }

    let precioFloat = null;
    if (precio) {
      precioFloat = parseFloat(precio);
      if (isNaN(precioFloat)) {
        return res.status(400).json({ error: 'El precio no es válido.' });
      }
    }

    let tortasEnBandeja = [];
    if (tortas) {
      try {
        tortasEnBandeja = JSON.parse(tortas);
      } catch (err) {
        console.error('Error parseando tortas:', err);
        return res.status(400).json({ error: 'El campo tortas no es JSON válido.' });
      }
    }

    let imagenUrl = null;
    if (req.file) {
      imagenUrl = await storageService.uploadImage(req.file, 'bandejas-imagen');
    }

    const bandejaActualizada = await bandejaService.updateBandeja({
      id_bandeja: id,
      nombre,
      precio: precioFloat,
      tamanio,
      imagenUrl,
      tortas: tortasEnBandeja
    });

    res.status(200).json(bandejaActualizada);

  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
});

router.delete('/:id', authenticateToken, requirePermissions(PERMISSIONS.BANDEJAS.ELIMINAR), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
   if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    await bandejaService.deleteBandeja(id);

    res.status(200).json({ message: 'Bandeja eliminada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la bandeja' });
  }
});

module.exports = router;
