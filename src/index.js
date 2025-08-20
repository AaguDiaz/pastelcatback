const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configura CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN ||'https://pastelcat.vercel.app',//  'http://localhost:3000', // 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware para parsear JSON
app.use(express.json());

// Rutas
const authRoutes = require('./routes/auth');
const materiasPrimasRoutes = require('./routes/materiaprima');
const tortasRoutes = require('./routes/torta');
const recetasRoutes = require('./routes/receta');
const bandejasRoutes = require('./routes/bandeja');

app.use('/auth', authRoutes);
app.use('/materias-primas', materiasPrimasRoutes);
app.use('/tortas', tortasRoutes);
app.use('/receta', recetasRoutes)
app.use('/bandejas', bandejasRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a PastelCatBack' });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error en el servidor' });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Servidor corriendo en puerto ${port}`);
});