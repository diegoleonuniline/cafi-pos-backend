const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');
const CONFIG = require('../config');

// Crear venta
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const ventaID = appsheet.generarID('VTA');
    
    const venta = {
      VentaID: ventaID,
      EmpresaID: data.empresaID,
      SucursalID: data.sucursalID,
      ClienteID: data.clienteID || '',
      UsuarioEmail: data.usuarioEmail,
      TipoPrecio: data.tipoPrecio || 1,
      Total: data.total,
      TipoVenta: data.tipoVenta || 'CONTADO',
      Estatus: data.estatus || 'PAGADA'
    };
    
    await appsheet.add(CONFIG.TABLAS.VENTAS, venta);
    
    // Detalles
    for (const item of data.items) {
      await appsheet.add(CONFIG.TABLAS.DETALLE_VENTA, {
        DetalleID: appsheet.generarID('DET'),
        VentaID: ventaID,
        ProductoID: item.productoID,
        Cantidad: item.cantidad,
        PrecioUnitario: item.precioUnitario,
        DescuentoPct: item.descuentoPct || 0,
        DescuentoMonto: item.descuentoMonto || 0,
        Subtotal: item.subtotal
      });
    }
    
    // Pagos
    if (data.pagos?.length > 0) {
      for (const pago of data.pagos.filter(p => p.monto > 0)) {
        await appsheet.add(CONFIG.TABLAS.ABONOS, {
          AbonoID: appsheet.generarID('ABO'),
          VentaID: ventaID,
          EmpresaID: data.empresaID,
          MetodoPagoID: pago.metodoPagoID,
          Monto: pago.monto,
          UsuarioEmail: data.usuarioEmail
        });
      }
    }
    
    res.json({ success: true, ventaID });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Ventas del día
router.get('/dia/:empresaID/:sucursalID', async (req, res) => {
  try {
    const { empresaID, sucursalID } = req.params;
    const hoy = appsheet.fechaHoy();
    const todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
    
    const ventas = todas.filter(v => {
      if (!v.FechaHora) return false;
      const matchEmpresa = String(v.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
      const matchSucursal = String(v.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
      const fechaVenta = String(v.FechaHora).substring(0, 10);
      return matchEmpresa && matchSucursal && fechaVenta === hoy;
    });
    
    res.json(ventas);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Resumen ventas hoy
router.get('/hoy/:empresaID/:sucursalID', async (req, res) => {
  try {
    const { empresaID, sucursalID } = req.params;
    const hoy = appsheet.fechaHoy();
    const todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
    
    const ventas = todas.filter(v => {
      if (!v.FechaHora) return false;
      const matchEmpresa = String(v.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
      const matchSucursal = String(v.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
      const fechaVenta = String(v.FechaHora).substring(0, 10);
      return matchEmpresa && matchSucursal && fechaVenta === hoy;
    });
    
    const stats = ventas.reduce((acc, v) => {
      if (v.Estatus === 'CANCELADA') {
        acc.canceladas++;
      } else {
        const total = parseFloat(v.Total) || 0;
        acc.total += total;
        if (v.TipoVenta === 'CREDITO') acc.credito += total;
        else acc.contado += total;
      }
      return acc;
    }, { total: 0, contado: 0, credito: 0, canceladas: 0 });
    
    res.json({
      success: true,
      totalVentas: ventas.length,
      totalMonto: stats.total,
      contado: stats.contado,
      credito: stats.credito,
      canceladas: stats.canceladas
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Ventas en espera
router.get('/espera/:empresaID/:sucursalID', async (req, res) => {
  try {
    const { empresaID, sucursalID } = req.params;
    const todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
    
    const ventas = todas.filter(v => {
      const matchEmpresa = String(v.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
      const matchSucursal = String(v.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
      const matchEstatus = String(v.Estatus || '').toUpperCase() === 'EN_ESPERA';
      return matchEmpresa && matchSucursal && matchEstatus;
    });
    
    // Agregar items
    const todosDetalles = await appsheet.find(CONFIG.TABLAS.DETALLE_VENTA, '');
    const resultado = ventas.map(v => ({
      ...v,
      items: todosDetalles.filter(d => 
        String(d.VentaID || '').toLowerCase() === String(v.VentaID || '').toLowerCase() &&
        (d.Estado || 'ACTIVO').toUpperCase() !== 'CANCELADO'
      )
    }));
    
    res.json({ success: true, ventas: resultado });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Ventas pendientes/crédito
router.get('/pendientes/:empresaID/:sucursalID', async (req, res) => {
  try {
    const { empresaID, sucursalID } = req.params;
    const todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
    
    const ventas = todas.filter(v => {
      const matchEmpresa = String(v.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
      const matchSucursal = String(v.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
      const matchCondicion = String(v.Estatus || '').toUpperCase() === 'PENDIENTE' || 
                             String(v.TipoVenta || '').toUpperCase() === 'CREDITO';
      return matchEmpresa && matchSucursal && matchCondicion;
    });
    
    const todosDetalles = await appsheet.find(CONFIG.TABLAS.DETALLE_VENTA, '');
    const resultado = ventas.map(v => ({
      ...v,
      items: todosDetalles.filter(d => 
        String(d.VentaID || '').toLowerCase() === String(v.VentaID || '').toLowerCase() &&
        (d.Estado || 'ACTIVO').toUpperCase() !== 'CANCELADO'
      )
    }));
    
    res.json({ success: true, ventas: resultado });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Actualizar estatus
router.put('/estatus/:ventaID', async (req, res) => {
  try {
    await appsheet.edit(CONFIG.TABLAS.VENTAS, {
      VentaID: req.params.ventaID,
      Estatus: req.body.estatus
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Cancelar venta
router.put('/cancelar/:ventaID', async (req, res) => {
  try {
    await appsheet.edit(CONFIG.TABLAS.VENTAS, {
      VentaID: req.params.ventaID,
      Estatus: 'CANCELADA'
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Reabrir venta
router.put('/reabrir/:ventaID', async (req, res) => {
  try {
    const { ventaID } = req.params;
    await appsheet.edit(CONFIG.TABLAS.VENTAS, { VentaID: ventaID, Estatus: 'REABIERTA' });
    
    const ventas = await appsheet.find(CONFIG.TABLAS.VENTAS, `[VentaID]="${ventaID}"`);
    const venta = ventas[0];
    
    if (venta) {
      const todosDetalles = await appsheet.find(CONFIG.TABLAS.DETALLE_VENTA, '');
      venta.items = todosDetalles.filter(d => 
        String(d.VentaID || '').toLowerCase() === ventaID.toLowerCase() &&
        (d.Estado || 'ACTIVO').toUpperCase() !== 'CANCELADO'
      );
    }
    
    res.json({ success: true, venta });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Actualizar venta en espera
router.put('/espera/:ventaID', async (req, res) => {
  try {
    const data = req.body;
    const { ventaID } = req.params;
    
    await appsheet.edit(CONFIG.TABLAS.VENTAS, {
      VentaID: ventaID,
      ClienteID: data.clienteID || '',
      TipoPrecio: data.tipoPrecio,
      Total: data.total,
      TipoVenta: data.tipoVenta,
      Estatus: 'EN_ESPERA'
    });
    
    const todosDetalles = await appsheet.find(CONFIG.TABLAS.DETALLE_VENTA, '');
    const itemsAnteriores = todosDetalles.filter(d => 
      String(d.VentaID || '').toLowerCase() === ventaID.toLowerCase() &&
      (d.Estado || 'ACTIVO').toUpperCase() !== 'CANCELADO'
    );
    
    for (const item of data.items) {
      const existente = itemsAnteriores.find(ia => 
        String(ia.ProductoID || '').toLowerCase() === String(item.productoID || '').toLowerCase()
      );
      
      if (existente) {
        await appsheet.edit(CONFIG.TABLAS.DETALLE_VENTA, {
          DetalleID: existente.DetalleID,
          Cantidad: item.cantidad,
          PrecioUnitario: item.precioUnitario,
          Subtotal: item.subtotal
        });
      } else {
        await appsheet.add(CONFIG.TABLAS.DETALLE_VENTA, {
          DetalleID: appsheet.generarID('DET'),
          VentaID: ventaID,
          ProductoID: item.productoID,
          Cantidad: item.cantidad,
          PrecioUnitario: item.precioUnitario,
          DescuentoPct: 0,
          DescuentoMonto: 0,
          Subtotal: item.subtotal,
          Estado: 'ACTIVO'
        });
      }
    }
    
    // Cancelar items que ya no están
    for (const ia of itemsAnteriores) {
      const sigueEnCarrito = data.items.find(item => 
        String(item.productoID || '').toLowerCase() === String(ia.ProductoID || '').toLowerCase()
      );
      if (!sigueEnCarrito) {
        await appsheet.edit(CONFIG.TABLAS.DETALLE_VENTA, {
          DetalleID: ia.DetalleID,
          Estado: 'CANCELADO'
        });
      }
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Cancelar detalle
router.put('/detalle/cancelar/:detalleID', async (req, res) => {
  try {
    await appsheet.edit(CONFIG.TABLAS.DETALLE_VENTA, {
      DetalleID: req.params.detalleID,
      Estado: 'CANCELADO'
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Agregar abono
router.post('/abono', async (req, res) => {
  try {
    const data = req.body;
    const abono = {
      AbonoID: appsheet.generarID('ABO'),
      VentaID: data.ventaID,
      EmpresaID: data.empresaID,
      MetodoPagoID: data.metodoPagoID,
      Monto: data.monto,
      UsuarioEmail: data.usuarioEmail,
      FechaHora: new Date().toISOString()
    };
    
    await appsheet.add(CONFIG.TABLAS.ABONOS, abono);
    res.json({ success: true, abonoID: abono.AbonoID });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Siguiente ticket
router.get('/ticket/:empresaID/:sucursalID', async (req, res) => {
  try {
    const { empresaID, sucursalID } = req.params;
    const hoy = appsheet.fechaHoy();
    const todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
    
    const ventas = todas.filter(v => {
      if (!v.FechaHora) return false;
      const matchEmpresa = String(v.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
      const matchSucursal = String(v.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
      const fechaVenta = String(v.FechaHora).substring(0, 10);
      return matchEmpresa && matchSucursal && fechaVenta === hoy;
    });
    
    res.json({ ticket: ventas.length + 1 });
  } catch (e) {
    res.json({ ticket: 1 });
  }
});

module.exports = router;
