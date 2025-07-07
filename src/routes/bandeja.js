// src/routes/bandeja.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth'); // Middleware de autenticación 
const { getTortasParaBandejas } = require('../services/bandejaservice'); // Importar el nuevo servicio

router.get('/tortas', authenticateToken, async (req, res) => {
    try {
        const tortas = await getTortasParaBandejas();
        res.json(tortas);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Ocurrió un error al obtener las tortas para bandejas.' });
    }
});

module.exports = router;