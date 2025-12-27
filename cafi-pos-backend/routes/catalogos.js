const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');
const CONFIG = require('../config');

// Proveedores
router.get('/proveedores/:empresaID', async (req, res) => {
  try {
    const proveedores = await appsheet.findFiltered(CONFIG.TABLAS.PROVEEDORES, req.params.empresaID);
    res.json(proveedores);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Métodos de pago
router.get('/metodos-pago/:empresaID', async (req, res) => {
  try {
    const metodos = await appsheet.findFiltered(CONFIG.TABLAS.METODOS_PAGO, req.params.empresaID);
    res.json(metodos);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
