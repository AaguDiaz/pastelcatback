const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configura CORS
const allowedOrigins = ['http://localhost:3000', 'https://pastelcat.vercel.app'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('No autorizado por CORS'))
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware para parsear JSON
app.use(express.json());

// Rutas
const authRoutes = require('./routes/auth');
const materiasPrimasRoutes = require('./routes/materiaprima');

app.use('/api', authRoutes);
app.use('/api/materias-primas', materiasPrimasRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a PastelCatBack' });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error en el servidor' });
});
