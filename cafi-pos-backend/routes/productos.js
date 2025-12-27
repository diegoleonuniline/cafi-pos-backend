const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');
const CONFIG = require('../config');

router.get('/:empresaID', async (req, res) => {
  try {
    const productos = await appsheet.findFiltered(CONFIG.TABLAS.PRODUCTOS, req.params.empresaID);
    res.json(productos);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const producto = {
      ProductoID: appsheet.generarID('PROD'),
      EmpresaID: data.empresaID,
      ProveedorID: data.proveedorID || '',
      NombreProducto: data.nombreProducto,
      PuntoVentaNombre: data.puntoVentaNombre || data.nombreProducto,
      CodigoBarras: data.codigoBarras || '',
      Imagen: data.imagen || '',
      UnidadCompra: data.unidadCompra || 'PZ',
      ContenidoUnidadCompra: data.contenidoUnidadCompra || 1,
      UnidadVenta: data.unidadVenta || 'PZ',
      Precio1: data.precio1 || 0,
      Precio2: data.precio2 || 0,
      Precio3: data.precio3 || 0,
      Precio4: data.precio4 || 0,
      Precio5: data.precio5 || 0,
      Precio6: data.precio6 || 0,
      PermiteDescuento: data.permiteDescuento ? 'Y' : 'N',
      DescuentoMax: data.descuentoMax || 0,
      Activo: 'Y',
      VentaPorPeso: data.ventaPorPeso ? 'Y' : 'N',
      UnidadBase: data.unidadBase || 'PZ'
    };
    
    await appsheet.add(CONFIG.TABLAS.PRODUCTOS, producto);
    res.json({ success: true, productoID: producto.ProductoID });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/:productoID', async (req, res) => {
  try {
    const row = { ProductoID: req.params.productoID, ...req.body };
    await appsheet.edit(CONFIG.TABLAS.PRODUCTOS, row);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/:productoID', async (req, res) => {
  try {
    await appsheet.edit(CONFIG.TABLAS.PRODUCTOS, { ProductoID: req.params.productoID, Activo: 'N' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
