const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const allowedOrigins = ['http://localhost:3000', 'https://pastelcat.vercel.app'];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No autorizado por CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // <- esta línea es clave

app.use(express.json());

// Rutas
const authRoutes = require('./routes/auth');
const materiasPrimasRoutes = require('./routes/materiaprima');

app.use(cors());
app.options('*', cors())

app.use('/api', authRoutes);
app.use('/api/materias-primas', materiasPrimasRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a PastelCatBack' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error en el servidor' });
});