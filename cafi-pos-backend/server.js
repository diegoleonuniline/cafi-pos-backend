require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// ============================================
// APPSHEET REQUEST FUNCTION
// ============================================
const APPSHEET_APP_ID = process.env.APPSHEET_APP_ID;
const APPSHEET_API_KEY = process.env.APPSHEET_API_KEY;

async function appsheetRequest(tableName, action, body = {}) {
  const url = `https://api.appsheet.com/api/v2/apps/${APPSHEET_APP_ID}/tables/${tableName}/Action`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'ApplicationAccessKey': APPSHEET_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Action: action,
      Properties: {
        Locale: 'es-MX',
        Timezone: 'America/Mexico_City'
      },
      ...body
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AppSheet API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  return data;
}

// Exportar para usar en rutas
module.exports.appsheetRequest = appsheetRequest;

// ============================================
// RUTAS
// ============================================
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
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ============================================
// CARGA INICIAL POS
// ============================================
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
    console.error('Error cargando datos POS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CATÁLOGOS INDIVIDUALES
// ============================================
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

app.get('/api/catalogos/proveedores/:empresaID', async (req, res) => {
  try {
    const { empresaID } = req.params;
    const response = await appsheetRequest('Proveedores', 'Find', {
      Selector: `Filter(Proveedores, [EmpresaID] = "${empresaID}", [Activo] = "Y")`
    });
    res.json({ success: true, proveedores: response || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log(`CAFI POS Backend corriendo en puerto ${PORT}`);
});
