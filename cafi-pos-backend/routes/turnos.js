const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');
const CONFIG = require('../config');

// Helper - Parsear fecha de AppSheet correctamente
function parsearFechaAppSheet(fechaStr) {
  if (!fechaStr) return new Date(0);
  
  if (fechaStr.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
    return new Date(fechaStr);
  }
  
  var partes = fechaStr.split(' ');
  var fechaParte = partes[0];
  var horaParte = partes[1] || '00:00:00';
  
  var fechaPartes = fechaParte.split('/');
  var mes = parseInt(fechaPartes[0], 10);
  var dia = parseInt(fechaPartes[1], 10);
  var anio = parseInt(fechaPartes[2], 10);
  
  var horaPartes = horaParte.split(':');
  var hora = parseInt(horaPartes[0], 10);
  var min = parseInt(horaPartes[1], 10);
  var seg = parseInt(horaPartes[2], 10) || 0;
  
  return new Date(anio, mes - 1, dia, hora, min, seg);
}

// Helper - Movimientos del turno
async function getMovimientosTurno(horaInicio, empresaID, sucursalID, usuarioEmail) {
  try {
    var movimientos = await appsheet.find(CONFIG.TABLAS.MOVIMIENTOS_CAJA, '');
    var inicio = parsearFechaAppSheet(horaInicio);
    var ahora = new Date();
    
    var filtrados = movimientos.filter(function(m) {
      var matchEmpresa = String(m.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
      var matchSucursal = String(m.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
      var matchUsuario = String(m.Usuario || '').toLowerCase() === usuarioEmail.toLowerCase();
      var fechaMov = parsearFechaAppSheet(m.FechaRegistro || m.Fecha);
      var dentroDelTurno = fechaMov >= inicio && fechaMov <= ahora;
      
      return matchEmpresa && matchSucursal && matchUsuario && dentroDelTurno;
    });
    
    return filtrados.map(function(m) {
      return {
        id: m.ID,
        tipo: m.Tipo,
        categoria: m.Categoria,
        concepto: m.Concepto,
        monto: parseFloat(m.Monto) || 0,
        fecha: m.FechaRegistro,
        observaciones: m.Observaciones
      };
    });
  } catch (e) { 
    console.error('Error getMovimientosTurno:', e);
    return []; 
  }
}

// Verificar turno abierto
router.get('/verificar/:empresaID/:sucursalID/:usuarioEmail', async function(req, res) {
  try {
    var empresaID = req.params.empresaID;
    var sucursalID = req.params.sucursalID;
    var usuarioEmail = req.params.usuarioEmail;
    
    var todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    var turnoAbierto = todosTurnos.find(function(t) {
      return String(t.Empresa || '').toLowerCase() === empresaID.toLowerCase() &&
        String(t.Sucursal || '').toLowerCase() === sucursalID.toLowerCase() &&
        String(t.Usuario || '').toLowerCase() === usuarioEmail.toLowerCase() &&
        String(t.EstadoActual || '').toLowerCase() === 'abierto';
    });
    
    if (turnoAbierto) {
      var movimientos = await getMovimientosTurno(turnoAbierto.HoraInicio, empresaID, sucursalID, usuarioEmail);
      res.json({
        success: true, 
        turnoAbierto: true,
        turno: { 
          id: turnoAbierto.Id, 
          horaInicio: turnoAbierto.HoraInicio, 
          saldoInicial: parseFloat(turnoAbierto.SaldoInicial) || 0, 
          usuario: turnoAbierto.Usuario 
        },
        movimientos: movimientos
      });
    } else {
      res.json({ success: true, turnoAbierto: false });
    }
  } catch (e) { 
    res.status(500).json({ success: false, error: e.message }); 
  }
});

// Abrir turno
router.post('/abrir', async function(req, res) {
  try {
    var data = req.body;
    var todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    var yaAbierto = todosTurnos.find(function(t) {
      return String(t.Empresa || '').toLowerCase() === data.empresaID.toLowerCase() &&
        String(t.Sucursal || '').toLowerCase() === data.sucursalID.toLowerCase() &&
        String(t.Usuario || '').toLowerCase() === data.usuarioEmail.toLowerCase() &&
        String(t.EstadoActual || '').toLowerCase() === 'abierto';
    });
    
    if (yaAbierto) {
      return res.json({ success: false, error: 'Ya tienes un turno abierto' });
    }
    
    var turnoID = appsheet.generarID('').substring(0, 8);
    var horaInicio = appsheet.fechaHoraActual();
    var registro = {
      Id: turnoID, 
      Empresa: data.empresaID, 
      Sucursal: data.sucursalID, 
      Usuario: data.usuarioEmail,
      HoraInicio: horaInicio, 
      SaldoInicial: parseFloat(data.saldoInicial) || 0,
      VentasTotales: 0, 
      Canceladas: 0, 
      Descuentos: 0, 
      Contado: 0, 
      Credito: 0,
      Efectivo: 0, 
      Tarjeta: 0, 
      Transferencia: 0, 
      Depositos: 0, 
      Otros: 0, 
      Retiros: 0, 
      EstadoActual: 'Abierto'
    };
    await appsheet.add(CONFIG.TABLAS.ABRIR_TURNO, registro);
    res.json({ success: true, turnoID: turnoID, horaInicio: horaInicio, saldoInicial: registro.SaldoInicial });
  } catch (e) { 
    res.status(500).json({ success: false, error: e.message }); 
  }
});

// Movimiento caja
router.post('/movimiento', async function(req, res) {
  try {
    var data = req.body;
    
    var todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    var turnoActivo = todosTurnos.find(function(t) {
      return String(t.Usuario || '').toLowerCase() === data.usuarioEmail.toLowerCase() &&
        String(t.EstadoActual || '').toLowerCase() === 'abierto';
    });
    
    var movID = appsheet.generarID('').substring(0, 8);
    var registro = {
      ID: movID, 
      EmpresaID: turnoActivo ? turnoActivo.Empresa : (data.empresaID || ''),
      SucursalID: turnoActivo ? turnoActivo.Sucursal : (data.sucursalID || ''),
      Tipo: data.tipo, 
      Usuario: data.usuarioEmail, 
      Categoria: data.categoria || '',
      Concepto: data.concepto, 
      Monto: parseFloat(data.monto) || 0, 
      Observaciones: data.observaciones || '',
      FechaRegistro: appsheet.fechaHoraActual()
    };
    await appsheet.add(CONFIG.TABLAS.MOVIMIENTOS_CAJA, registro);
    res.json({ success: true, movimientoID: movID, movimiento: registro });
  } catch (e) { 
    res.status(500).json({ success: false, error: e.message }); 
  }
});

// Resumen turno (POST)
router.post('/resumen', async function(req, res) {
  try {
    var turnoID = req.body.turnoID;
    var empresaID = req.body.empresaID;
    var sucursalID = req.body.sucursalID;
    var usuarioEmail = req.body.usuarioEmail;
    
    console.log('=== RESUMEN TURNO ===');
    console.log('turnoID:', turnoID);
    
    // BUSCAR TURNO MANUALMENTE (el filtro de AppSheet no funciona bien)
    var todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    var turno = todosTurnos.find(function(t) {
      return t.Id === turnoID;
    });
    
    if (!turno) {
      return res.json({ success: false, error: 'Turno no encontrado' });
    }
    
    console.log('Turno encontrado:', turno.Id, 'HoraInicio:', turno.HoraInicio);
    
    var horaInicio = turno.HoraInicio;
    var saldoInicial = parseFloat(turno.SaldoInicial) || 0;
    var fechaInicioTurno = parsearFechaAppSheet(horaInicio);
    var ahora = new Date();
    
    console.log('fechaInicioTurno:', fechaInicioTurno.toISOString());
    console.log('ahora:', ahora.toISOString());
    
    // Métodos de pago
    var metodosPago = [];
    try { 
      metodosPago = await appsheet.find(CONFIG.TABLAS.METODOS_PAGO, ''); 
    } catch (e) { 
      metodosPago = []; 
    }
    var metodoMap = {};
    metodosPago.forEach(function(m) { 
      metodoMap[m.MetodoPagoID] = (m.Nombre || '').toLowerCase(); 
    });
    
    // Ventas
    var ventas = [];
    try {
      var todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
      
      ventas = todas.filter(function(v) {
        var matchEmpresa = String(v.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
        var matchSucursal = String(v.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
        var matchUsuario = String(v.UsuarioEmail || '').toLowerCase() === usuarioEmail.toLowerCase();
        var matchEstatus = (v.Estatus || '').toUpperCase() !== 'EN_ESPERA';
        var fechaVenta = parsearFechaAppSheet(v.FechaHora);
        var dentroDelTurno = fechaVenta >= fechaInicioTurno && fechaVenta <= ahora;
        
        return matchEmpresa && matchSucursal && matchUsuario && matchEstatus && dentroDelTurno;
      });
    } catch (e) { 
      ventas = []; 
    }
    
    var ventasTotales = 0, canceladas = 0, descuentos = 0, contado = 0, credito = 0;
    ventas.forEach(function(v) {
      var total = parseFloat(v.Total) || 0;
      if ((v.Estatus || '').toUpperCase() === 'CANCELADA') { 
        canceladas += total; 
      } else { 
        ventasTotales += total; 
        if (v.TipoVenta === 'CREDITO') credito += total; 
        else contado += total; 
      }
      descuentos += parseFloat(v.Descuentos) || 0;
    });
    
    // Abonos
    var pagos = [];
    try {
      var todosPagos = await appsheet.find(CONFIG.TABLAS.ABONOS, '');
      
      pagos = todosPagos.filter(function(p) {
        var matchEmpresa = String(p.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
        var matchSucursal = String(p.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
        var matchUsuario = String(p.UsuarioEmail || '').toLowerCase() === usuarioEmail.toLowerCase();
        var fechaPago = parsearFechaAppSheet(p.FechaHora || p.Fecha);
        var dentroDelTurno = fechaPago >= fechaInicioTurno && fechaPago <= ahora;
        
        return matchEmpresa && matchSucursal && matchUsuario && dentroDelTurno;
      });
    } catch (e) { 
      pagos = []; 
    }
    
    var efectivo = 0, tarjeta = 0, transferencia = 0, otros = 0;
    pagos.forEach(function(p) {
      var monto = parseFloat(p.Monto) || 0;
      var nombreMetodo = metodoMap[p.MetodoPagoID || p.MetodoPago || ''] || '';
      
      if (nombreMetodo.indexOf('efectivo') >= 0 || nombreMetodo.indexOf('cash') >= 0) efectivo += monto;
      else if (nombreMetodo.indexOf('tarjeta') >= 0 || nombreMetodo.indexOf('card') >= 0) tarjeta += monto;
      else if (nombreMetodo.indexOf('transferencia') >= 0 || nombreMetodo.indexOf('transfer') >= 0) transferencia += monto;
      else otros += monto;
    });
    
    // Movimientos
    var movimientos = await getMovimientosTurno(horaInicio, empresaID, sucursalID, usuarioEmail);
    var ingresos = 0, egresos = 0;
    movimientos.forEach(function(m) { 
      if (m.tipo === 'Ingreso') ingresos += m.monto; 
      else if (m.tipo === 'Egreso') egresos += m.monto; 
    });
    
    var efectivoEsperado = saldoInicial + efectivo + ingresos - egresos;
    
    console.log('=== RESULTADO ===');
    console.log('saldoInicial:', saldoInicial);
    console.log('efectivo:', efectivo);
    console.log('ingresos:', ingresos);
    console.log('egresos:', egresos);
    console.log('EFECTIVO ESPERADO:', efectivoEsperado);
    
    res.json({
      success: true,
      resumen: { 
        turnoID: turnoID, 
        horaInicio: horaInicio, 
        saldoInicial: saldoInicial, 
        ventasTotales: ventasTotales, 
        canceladas: canceladas, 
        descuentos: descuentos, 
        contado: contado, 
        credito: credito, 
        efectivo: efectivo, 
        tarjeta: tarjeta, 
        transferencia: transferencia, 
        ingresos: ingresos, 
        egresos: egresos, 
        otros: otros, 
        efectivoEsperado: efectivoEsperado, 
        totalVentas: ventas.length, 
        movimientos: movimientos 
      }
    });
  } catch (e) { 
    console.error('Error /resumen:', e);
    res.status(500).json({ success: false, error: e.message }); 
  }
});

// Cerrar turno
router.post('/cerrar', async function(req, res) {
  try {
    var data = req.body;
    
    console.log('=== CERRAR TURNO ===');
    console.log('turnoID:', data.turnoID);
    
    // BUSCAR TURNO MANUALMENTE (el filtro de AppSheet no funciona bien)
    var todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    var turno = todosTurnos.find(function(t) {
      return t.Id === data.turnoID;
    });
    
    if (!turno) {
      return res.json({ success: false, error: 'Turno no encontrado' });
    }
    
    console.log('Turno encontrado:', turno.Id, 'HoraInicio:', turno.HoraInicio);
    
    var horaInicio = turno.HoraInicio;
    var saldoInicial = parseFloat(turno.SaldoInicial) || 0;
    var efectivoReal = parseFloat(data.efectivoReal) || 0;
    var horaCierre = appsheet.fechaHoraActual();
    var fechaInicioTurno = parsearFechaAppSheet(horaInicio);
    var ahora = new Date();
    
    // Métodos de pago
    var metodosPago = [];
    try { 
      metodosPago = await appsheet.find(CONFIG.TABLAS.METODOS_PAGO, ''); 
    } catch (e) { 
      metodosPago = []; 
    }
    var metodoMap = {};
    metodosPago.forEach(function(m) { 
      metodoMap[m.MetodoPagoID] = (m.Nombre || '').toLowerCase(); 
    });
    
    // Ventas
    var ventas = [];
    try {
      var todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
      ventas = todas.filter(function(v) {
        var matchEmpresa = String(v.EmpresaID || '').toLowerCase() === data.empresaID.toLowerCase();
        var matchSucursal = String(v.SucursalID || '').toLowerCase() === data.sucursalID.toLowerCase();
        var matchUsuario = String(v.UsuarioEmail || '').toLowerCase() === data.usuarioEmail.toLowerCase();
        var matchEstatus = (v.Estatus || '').toUpperCase() !== 'EN_ESPERA';
        var fechaVenta = parsearFechaAppSheet(v.FechaHora);
        var dentroDelTurno = fechaVenta >= fechaInicioTurno && fechaVenta <= ahora;
        return matchEmpresa && matchSucursal && matchUsuario && matchEstatus && dentroDelTurno;
      });
    } catch (e) { 
      ventas = []; 
    }
    
    var ventasTotales = 0, canceladas = 0, descuentos = 0, contado = 0, credito = 0;
    ventas.forEach(function(v) {
      var total = parseFloat(v.Total) || 0;
      if ((v.Estatus || '').toUpperCase() === 'CANCELADA') canceladas += total;
      else { 
        ventasTotales += total; 
        if (v.TipoVenta === 'CREDITO') credito += total; 
        else contado += total; 
      }
      descuentos += parseFloat(v.Descuentos) || 0;
    });
    
    // Pagos
    var pagos = [];
    try { 
      var todosPagos = await appsheet.find(CONFIG.TABLAS.ABONOS, ''); 
      pagos = todosPagos.filter(function(p) {
        var matchEmpresa = String(p.EmpresaID || '').toLowerCase() === data.empresaID.toLowerCase();
        var matchSucursal = String(p.SucursalID || '').toLowerCase() === data.sucursalID.toLowerCase();
        var matchUsuario = String(p.UsuarioEmail || '').toLowerCase() === data.usuarioEmail.toLowerCase();
        var fechaPago = parsearFechaAppSheet(p.FechaHora || p.Fecha);
        return matchEmpresa && matchSucursal && matchUsuario && fechaPago >= fechaInicioTurno && fechaPago <= ahora;
      });
    } catch (e) { 
      pagos = []; 
    }
    
    var efectivo = 0, tarjeta = 0, transferencia = 0, otros = 0;
    pagos.forEach(function(p) {
      var monto = parseFloat(p.Monto) || 0;
      var nombreMetodo = metodoMap[p.MetodoPagoID || ''] || '';
      if (nombreMetodo.indexOf('efectivo') >= 0) efectivo += monto;
      else if (nombreMetodo.indexOf('tarjeta') >= 0) tarjeta += monto;
      else if (nombreMetodo.indexOf('transferencia') >= 0) transferencia += monto;
      else otros += monto;
    });
    
    // Movimientos
    var movimientos = await getMovimientosTurno(horaInicio, data.empresaID, data.sucursalID, data.usuarioEmail);
    var ingresos = 0, egresos = 0;
    movimientos.forEach(function(m) { 
      if (m.tipo === 'Ingreso') ingresos += m.monto; 
      else if (m.tipo === 'Egreso') egresos += m.monto; 
    });
    
    var efectivoEsperado = saldoInicial + efectivo + ingresos - egresos;
    
    console.log('efectivoEsperado:', efectivoEsperado);
    console.log('efectivoReal:', efectivoReal);
    
    await appsheet.edit(CONFIG.TABLAS.ABRIR_TURNO, {
      Id: data.turnoID, 
      VentasTotales: ventasTotales, 
      Canceladas: canceladas, 
      Descuentos: descuentos,
      Contado: contado, 
      Credito: credito, 
      Efectivo: efectivo, 
      Tarjeta: tarjeta, 
      Transferencia: transferencia,
      Depositos: ingresos, 
      Retiros: egresos, 
      Otros: otros, 
      HoraCierre: horaCierre,
      EfectivoEsperado: efectivoEsperado, 
      EfectivoReal: efectivoReal, 
      Diferencia: efectivoReal - efectivoEsperado,
      EstadoActual: 'Cerrado', 
      Observaciones: data.observaciones || ''
    });
    
    res.json({
      success: true, 
      mensaje: 'Turno cerrado',
      resumen: { 
        ventasTotales: ventasTotales, 
        canceladas: canceladas, 
        descuentos: descuentos, 
        contado: contado, 
        credito: credito, 
        efectivo: efectivo, 
        tarjeta: tarjeta, 
        transferencia: transferencia, 
        ingresos: ingresos, 
        egresos: egresos, 
        otros: otros, 
        efectivoEsperado: efectivoEsperado 
      },
      efectivoReal: efectivoReal, 
      diferencia: efectivoReal - efectivoEsperado
    });
  } catch (e) { 
    console.error('Error /cerrar:', e);
    res.status(500).json({ success: false, error: e.message }); 
  }
});

module.exports = router;
