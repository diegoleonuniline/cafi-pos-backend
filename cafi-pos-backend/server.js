require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
const authRoutes = require('./routes/auth');
const productosRoutes = require('./routes/productos');
const clientesRoutes = require('./routes/clientes');
const ventasRoutes = require('./routes/ventas');
const turnosRoutes = require('./routes/turnos');
const catalogosRoutes = require('./routes/catalogos');

app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/turnos', turnosRoutes);
app.use('/api/catalogos', catalogosRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Carga inicial POS
app.get('/api/pos/cargar/:empresaID', async (req, res) => {
  try {
    const { empresaID } = req.params;
    const appsheet = require('./services/appsheet');
    
    const [productos, clientes, metodosPago, proveedores] = await Promise.all([
      appsheet.findFiltered('Productos', empresaID),
      appsheet.findFiltered('Clientes', empresaID),
      appsheet.findFiltered('MetodosPago', empresaID),
      appsheet.findFiltered('Proveedores', empresaID)
    ]);
    
    res.json({ success: true, productos, clientes, metodosPago, proveedores });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`CAFI POS Backend corriendo en puerto ${PORT}`);
});
