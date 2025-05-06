const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getTortas,
  createTorta,
  updateTorta,
  deleteTorta,
  uploadImage,
} = require('../services/tortaservice');
const multer = require('multer');

const upload = multer();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, search = '' } = req.query;
    const result = await getTortas(parseInt(page), search);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, upload.single('imagen'), async (req, res) => {
  try {
    const { nombre, precio, tamanio } = req.body;
    if (!nombre || !precio || !tamanio) {
      return res.status(400).json({ error: 'Faltan campos requeridos: nombre, precio o tamaño.' });
    }
    const precioFloat = parseFloat(precio);
    if (isNaN(precioFloat) || precioFloat <= 0) {
        return res.status(400).json({ error: 'El precio no es un número válido o es menor o igual a cero.' });
    }

    let imagenUrl = null;
    if (req.file) {
      imagenUrl = await uploadImage(req.file);
    }
    const nuevaTorta = await createTorta({ nombre, precio: precioFloat, tamanio, imagen: imagenUrl });

    res.status(201).json(nuevaTorta);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Ocurrió un error al procesar la solicitud.' });
  }
});

router.put('/:id', authenticateToken, upload.single('imagen'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, tamanio, existingImage } = req.body;

    if (!nombre || !precio || !tamanio) {
      return res.status(400).json({ error: 'Faltan campos requeridos: nombre, precio o tamaño.' });
    }

    const precioFloat = parseFloat(precio);
    if (isNaN(precioFloat) || precioFloat <= 0) {
      return res.status(400).json({ error: 'El precio no es un número válido o es menor o igual a cero.' });
    }

    const updatedTorta = await updateTorta(id, {
      nombre,
      precio: precioFloat,
      tamanio,
      imagen: req.file || null, // Nueva imagen si existe
      existingImage: existingImage || null, // Imagen existente para comparar o eliminar
    });

    res.status(200).json(updatedTorta);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Ocurrió un error al procesar la solicitud.' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await deleteTorta(id);
    res.status(204).send(); 
  } catch (err) {
    res.status(400).json({ error: err.message || 'Ocurrió un error al eliminar la torta.' });
  }
});

module.exports = router;