require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.options('*', cors());
app.use(express.json());

const APPSHEET_APP_ID = process.env.APPSHEET_APP_ID;
const APPSHEET_API_KEY = process.env.APPSHEET_API_KEY;

function appsheetRequest(tableName, action, body = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ Action: action, Properties: { Locale: 'es-MX', Timezone: 'America/Mexico_City' }, ...body });
    const options = {
      hostname: 'api.appsheet.com',
      path: `/api/v2/apps/${APPSHEET_APP_ID}/tables/${tableName}/Action`,
      method: 'POST',
      headers: { 'ApplicationAccessKey': APPSHEET_API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve([]); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports.appsheetRequest = appsheetRequest;

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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/pos/cargar/:empresaID', async (req, res) => {
  try {
    const { empresaID } = req.params;
    const [productos, clientes, metodosPago, proveedores, marcas, categorias] = await Promise.all([
      appsheetRequest('Productos', 'Find', { Selector: `Filter(Productos, [EmpresaID] = "${empresaID}", [Activo] = "Y")` }),
      appsheetRequest('Clientes', 'Find', { Selector: `Filter(Clientes, [EmpresaID] = "${empresaID}")` }),
      appsheetRequest('MetodosPago', 'Find', { Selector: `Filter(MetodosPago, [EmpresaID] = "${empresaID}", [Activo] = "Y")` }),
      appsheetRequest('Proveedores', 'Find', { Selector: `Filter(Proveedores, [EmpresaID] = "${empresaID}", [Activo] = "Y")` }),
      appsheetRequest('Marcas', 'Find', { Selector: `Filter(Marcas, [EmpresaID] = "${empresaID}")` }),
      appsheetRequest('Categorias', 'Find', { Selector: `Filter(Categorias, [EmpresaID] = "${empresaID}", [Activo] = "Y")` })
    ]);
    res.json({ success: true, productos: productos || [], clientes: clientes || [], metodosPago: metodosPago || [], proveedores: proveedores || [], marcas: marcas || [], categorias: categorias || [] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/catalogos/marcas/:empresaID', async (req, res) => {
  try { res.json({ success: true, marcas: await appsheetRequest('Marcas', 'Find', { Selector: `Filter(Marcas, [EmpresaID] = "${req.params.empresaID}")` }) || [] }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/catalogos/categorias/:empresaID', async (req, res) => {
  try { res.json({ success: true, categorias: await appsheetRequest('Categorias', 'Find', { Selector: `Filter(Categorias, [EmpresaID] = "${req.params.empresaID}", [Activo] = "Y")` }) || [] }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/catalogos/proveedores/:empresaID', async (req, res) => {
  try { res.json({ success: true, proveedores: await appsheetRequest('Proveedores', 'Find', { Selector: `Filter(Proveedores, [EmpresaID] = "${req.params.empresaID}", [Activo] = "Y")` }) || [] }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.listen(PORT, () => console.log(`CAFI POS Backend en puerto ${PORT}`));
