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
    
    const [productos, clientes, metodosPago, proveedores, marcas, categorias] = await Promise.all([
      appsheetRequest('Productos', 'Find', {
        Selector: `Filter(Productos, [EmpresaID] = "${empresaID}", [Activo] = "Y")`
      }),
      appsheetRequest('Clientes', 'Find', {
        Selector: `Filter(Clientes, [EmpresaID] = "${empresaID}")`
      }),
      appsheetRequest('MetodosPago', 'Find', {
        Selector: `Filter(MetodosPago, [EmpresaID] = "${empresaID}", [Activo] = "Y")`
      }),
      appsheetRequest('Proveedores', 'Find', {
        Selector: `Filter(Proveedores, [EmpresaID] = "${empresaID}", [Activo] = "Y")`
      }),
      appsheetRequest('Marcas', 'Find', {
        Selector: `Filter(Marcas, [EmpresaID] = "${empresaID}")`
      }),
      appsheetRequest('Categorias', 'Find', {
        Selector: `Filter(Categorias, [EmpresaID] = "${empresaID}", [Activo] = "Y")`
      })
    ]);
    
    res.json({
      success: true,
      productos: productos || [],
      clientes: clientes || [],
      metodosPago: metodosPago || [],
      proveedores: proveedores || [],
      marcas: marcas || [],
      categorias: categorias || []
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`CAFI POS Backend corriendo en puerto ${PORT}`);
});
// ========== CATÁLOGOS ==========

// GET Marcas por empresa
app.get('/api/catalogos/marcas/:empresaID', async (req, res) => {
  try {
    const { empresaID } = req.params;
    const response = await appsheetRequest('Marcas', 'Find', {
      Selector: `Filter(Marcas, [EmpresaID] = "${empresaID}")`
    });
    res.json({ success: true, marcas: response || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Categorias por empresa
app.get('/api/catalogos/categorias/:empresaID', async (req, res) => {
  try {
    const { empresaID } = req.params;
    const response = await appsheetRequest('Categorias', 'Find', {
      Selector: `Filter(Categorias, [EmpresaID] = "${empresaID}", [Activo] = "Y")`
    });
    res.json({ success: true, categorias: response || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
