const express = require('express');
const router = express.Router();
const multer = require('multer');

const { authenticateToken } = require('../middleware/auth'); // Middleware de autenticación 
const bandejaService = require('../services/bandejaservice'); // Importar el nuevo servicio
const { uploadImage, deleteImage } = require('../services/storageService'); // Importar el servicio de almacenamiento
const upload = multer({storage: multer.memoryStorage()}); // Configuración de multer para manejar archivos

router.get('/tortas', authenticateToken, async (req, res) => {
    try {
        const tortas = await bandejaService.getTortasParaBandejas();
        res.json(tortas);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Ocurrió un error al obtener las tortas para bandejas.' });
    }
});

router.post('/', authenticateToken, upload.single('imagen'), async (req, res) => {
    console.log("→ LLEGÓ POST /bandejas");

    console.log("→ req.body:", req.body);
    console.log("→ req.file:", req.file); // si usás multer
    console.log("→ req.files:", req.files);
    try {
        const { nombre, precio, tamanio, tortas } = req.body;
        const imagenFile = req.file; // El archivo subido estará aquí gracias a Multer

        // Multer envía el campo 'tortas' como string JSON, necesitamos parsearlo de nuevo a un array
        const parsedTortas = JSON.parse(req.body.tortas);

        let imageUrl = null;
        if (imagenFile) {
            // Subir la imagen a Supabase Storage
            imageUrl = await uploadImage(imagenFile, 'bandejas-imagen'); 
        }

        const newBandejaData = {
            nombre: nombre,
            precio: precio ? Number(precio) : null, // Convertir a número, puede ser null
            tamanio: tamanio,
            imagenUrl: imageUrl, // Pasa la URL de la imagen al servicio de base de datos
        };

        const newBandeja = await bandejaService.createBandeja(newBandejaData, parsedTortas);

        res.status(201).json(newBandeja); // Envía la bandeja creada como respuesta
    } catch (error) {
        console.error('Error al crear bandeja en la ruta:', error.message);
        res.status(500).json({ message: error.message || 'Error interno del servidor al crear la bandeja.' });
    }
});

module.exports = router;