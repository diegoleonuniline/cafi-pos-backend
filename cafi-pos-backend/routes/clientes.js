const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');
const CONFIG = require('../config');

router.get('/:empresaID', async (req, res) => {
  try {
    const clientes = await appsheet.findFiltered(CONFIG.TABLAS.CLIENTES, req.params.empresaID);
    res.json(clientes);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const cliente = {
      ClienteID: appsheet.generarID('CLI'),
      EmpresaID: data.empresaID,
      Nombre: data.nombre,
      Telefono: data.telefono || '',
      Email: data.email || '',
      Direccion: data.direccion || '',
      TipoPrecio: data.tipoPrecio || 1,
      Credito: data.credito ? 'Y' : 'N',
      LimiteCredito: data.limiteCredito || 0,
      Activo: 'Y'
    };
    
    await appsheet.add(CONFIG.TABLAS.CLIENTES, cliente);
    res.json({ success: true, clienteID: cliente.ClienteID });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/:clienteID', async (req, res) => {
  try {
    const row = { ClienteID: req.params.clienteID, ...req.body };
    await appsheet.edit(CONFIG.TABLAS.CLIENTES, row);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/:clienteID', async (req, res) => {
  try {
    await appsheet.edit(CONFIG.TABLAS.CLIENTES, { ClienteID: req.params.clienteID, Activo: 'N' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
