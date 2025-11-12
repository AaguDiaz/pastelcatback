const express = require('express');
const {sendError, AppError} = require('./utils/errors');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configura CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN ||'https://pastelcat.vercel.app',//'http://localhost:3000', //   
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
const pedidosRoutes = require('./routes/pedido');
const clientesRoutes = require('./routes/cliente');
const productosRoutes = require('./routes/producto');
const dashboardRoutes = require('./routes/dashboard');
const usuariosRoutes = require('./routes/usuario');

app.use('/auth', authRoutes);
app.use('/materias-primas', materiasPrimasRoutes);
app.use('/tortas', tortasRoutes);
app.use('/receta', recetasRoutes)
app.use('/bandejas', bandejasRoutes);
app.use('/pedidos', pedidosRoutes);
app.use('/clientes', clientesRoutes);
app.use('/productos', productosRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/usuarios', usuariosRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a PastelCatBack' });
});

// Manejo de errores
app.use((req, res, next) => next(AppError.notFound('Endpoint no encontrado')));
app.use((err, req, res, next) => sendError(res, err));

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Servidor corriendo en puerto ${port}`);
});
