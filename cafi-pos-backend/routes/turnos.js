const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');
const CONFIG = require('../config');

// =====================================================
// HELPER - Parsear fecha de AppSheet correctamente
// AppSheet envía formato: "12/29/2025 12:50:48" (MM/DD/YYYY HH:MM:SS)
// =====================================================
function parsearFechaAppSheet(fechaStr) {
  if (!fechaStr) return new Date(0);
  
  console.log('  [parsearFecha] entrada:', fechaStr);
  
  // Si ya es ISO format (contiene T o guiones al inicio), parsearlo directo
  if (fechaStr.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
    const fecha = new Date(fechaStr);
    console.log('  [parsearFecha] ISO detectado, resultado:', fecha.toISOString());
    return fecha;
  }
  
  // Formato AppSheet: "12/29/2025 12:50:48" (MM/DD/YYYY HH:MM:SS)
  const partes = fechaStr.split(' ');
  const fechaParte = partes[0];
  const horaParte = partes[1] || '00:00:00';
  
  const [mes, dia, anio] = fechaParte.split('/').map(Number);
  const [hora, min, seg] = horaParte.split(':').map(Number);
  
  // Crear fecha en hora LOCAL (no UTC)
  const fecha = new Date(anio, mes - 1, dia, hora, min, seg || 0);
  
  console.log('  [parsearFecha] partes:', { mes, dia, anio, hora, min, seg });
  console.log('  [parsearFecha] resultado:', fecha.toISOString());
  
  return fecha;
}

// =====================================================
// HELPER - Movimientos del turno
// =====================================================
async function getMovimientosTurno(horaInicio, empresaID, sucursalID, usuarioEmail) {
  try {
    const movimientos = await appsheet.find(CONFIG.TABLAS.MOVIMIENTOS_CAJA, '');
    const inicio = parsearFechaAppSheet(horaInicio);
    const ahora = new Date();
    
    console.log('=== getMovimientosTurno ===');
    console.log('horaInicio string:', horaInicio);
    console.log('inicio parseado:', inicio.toISOString());
    console.log('ahora:', ahora.toISOString());
    console.log('Total movimientos en BD:', movimientos.length);
    
    const filtrados = movimientos.filter(m => {
      const matchEmpresa = String(m.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
      const matchSucursal = String(m.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
      const matchUsuario = String(m.Usuario || '').toLowerCase() === usuarioEmail.toLowerCase();
      const fechaMov = parsearFechaAppSheet(m.FechaRegistro || m.Fecha);
      const dentroDelTurno = fechaMov >= inicio && fechaMov <= ahora;
      
      if (matchEmpresa && matchSucursal && matchUsuario) {
        console.log(`Mov ${m.ID}: fecha=${m.FechaRegistro} parseada=${fechaMov.toISOString()} inicio=${inicio.toISOString()} dentro=${dentroDelTurno}`);
      }
      
      return matchEmpresa && matchSucursal && matchUsuario && dentroDelTurno;
    });
    
    console.log('Movimientos filtrados:', filtrados.length);
    
    return filtrados.map(m => ({
      id: m.ID,
      tipo: m.Tipo,
      categoria: m.Categoria,
      concepto: m.Concepto,
      monto: parseFloat(m.Monto) || 0,
      fecha: m.FechaRegistro,
      observaciones: m.Observaciones
    }));
  } catch (e) { 
    console.error('Error getMovimientosTurno:', e);
    return []; 
  }
}

// =====================================================
// Verificar turno abierto
// =====================================================
router.get('/verificar/:empresaID/:sucursalID/:usuarioEmail', async (req, res) => {
  try {
    const { empresaID, sucursalID, usuarioEmail } = req.params;
    const todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    const turnoAbierto = todosTurnos.find(t => {
      return String(t.Empresa || '').toLowerCase() === empresaID.toLowerCase() &&
        String(t.Sucursal || '').toLowerCase() === sucursalID.toLowerCase() &&
        String(t.Usuario || '').toLowerCase() === usuarioEmail.toLowerCase() &&
        String(t.EstadoActual || '').toLowerCase() === 'abierto';
    });
    if (turnoAbierto) {
      const movimientos = await getMovimientosTurno(turnoAbierto.HoraInicio, empresaID, sucursalID, usuarioEmail);
      res.json({
        success: true, turnoAbierto: true,
        turno: { 
          id: turnoAbierto.Id, 
          horaInicio: turnoAbierto.HoraInicio, 
          saldoInicial: parseFloat(turnoAbierto.SaldoInicial) || 0, 
          usuario: turnoAbierto.Usuario 
        },
        movimientos
      });
    } else {
      res.json({ success: true, turnoAbierto: false });
    }
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// =====================================================
// Abrir turno
// =====================================================
router.post('/abrir', async (req, res) => {
  try {
    const data = req.body;
    const todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    const yaAbierto = todosTurnos.find(t => {
      return String(t.Empresa || '').toLowerCase() === data.empresaID.toLowerCase() &&
        String(t.Sucursal || '').toLowerCase() === data.sucursalID.toLowerCase() &&
        String(t.Usuario || '').toLowerCase() === data.usuarioEmail.toLowerCase() &&
        String(t.EstadoActual || '').toLowerCase() === 'abierto';
    });
    if (yaAbierto) return res.json({ success: false, error: 'Ya tienes un turno abierto' });
    
    const turnoID = appsheet.generarID('').substring(0, 8);
    const horaInicio = appsheet.fechaHoraActual();
    const registro = {
      Id: turnoID, Empresa: data.empresaID, Sucursal: data.sucursalID, Usuario: data.usuarioEmail,
      HoraInicio: horaInicio, SaldoInicial: parseFloat(data.saldoInicial) || 0,
      VentasTotales: 0, Canceladas: 0, Descuentos: 0, Contado: 0, Credito: 0,
      Efectivo: 0, Tarjeta: 0, Transferencia: 0, Depositos: 0, Otros: 0, Retiros: 0, EstadoActual: 'Abierto'
    };
    await appsheet.add(CONFIG.TABLAS.ABRIR_TURNO, registro);
    res.json({ success: true, turnoID, horaInicio, saldoInicial: registro.SaldoInicial });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// =====================================================
// Movimiento caja
// =====================================================
router.post('/movimiento', async (req, res) => {
  try {
    const data = req.body;
    
    const todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    const turnoActivo = todosTurnos.find(t => {
      return String(t.Usuario || '').toLowerCase() === data.usuarioEmail.toLowerCase() &&
        String(t.EstadoActual || '').toLowerCase() === 'abierto';
    });
    
    const movID = appsheet.generarID('').substring(0, 8);
    const registro = {
      ID: movID, 
      EmpresaID: turnoActivo?.Empresa || data.empresaID || '',
      SucursalID: turnoActivo?.Sucursal || data.sucursalID || '',
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
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// =====================================================
// Resumen turno (POST)
// =====================================================
router.post('/resumen', async (req, res) => {
  try {
    const { turnoID, empresaID, sucursalID, usuarioEmail } = req.body;
    
    console.log('');
    console.log('========================================');
    console.log('=== RESUMEN TURNO - INICIO ===');
    console.log('========================================');
    console.log('turnoID:', turnoID);
    console.log('empresaID:', empresaID);
    console.log('sucursalID:', sucursalID);
    console.log('usuarioEmail:', usuarioEmail);
    
    const turnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, `Id="${turnoID}"`);
    if (turnos.length === 0) return res.json({ success: false, error: 'Turno no encontrado' });
    
    const turno = turnos[0];
    const horaInicio = turno.HoraInicio;
    const saldoInicial = parseFloat(turno.SaldoInicial) || 0;
    const fechaInicioTurno = parsearFechaAppSheet(horaInicio);
    const ahora = new Date();
    
    console.log('');
    console.log('=== FECHAS DEL TURNO ===');
    console.log('horaInicio (string AppSheet):', horaInicio);
    console.log('fechaInicioTurno (parseada):', fechaInicioTurno.toISOString());
    console.log('fechaInicioTurno (local):', fechaInicioTurno.toString());
    console.log('ahora (ISO):', ahora.toISOString());
    console.log('ahora (local):', ahora.toString());
    console.log('saldoInicial:', saldoInicial);
    
    // Métodos de pago
    let metodosPago = [];
    try { metodosPago = await appsheet.find(CONFIG.TABLAS.METODOS_PAGO, `EmpresaID="${empresaID}"`); } catch { metodosPago = []; }
    const metodoMap = {};
    metodosPago.forEach(m => { metodoMap[m.MetodoPagoID] = (m.Nombre || '').toLowerCase(); });
    
    // =====================================================
    // VENTAS
    // =====================================================
    let ventas = [];
    try {
      const todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
      console.log('');
      console.log('=== VENTAS ===');
      console.log('Total ventas en BD:', todas.length);
      
      ventas = todas.filter(v => {
        const matchEmpresa = String(v.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
        const matchSucursal = String(v.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
        const matchUsuario = String(v.UsuarioEmail || '').toLowerCase() === usuarioEmail.toLowerCase();
        const matchEstatus = (v.Estatus || '').toUpperCase() !== 'EN_ESPERA';
        const fechaVenta = parsearFechaAppSheet(v.FechaHora);
        const dentroDelTurno = fechaVenta >= fechaInicioTurno && fechaVenta <= ahora;
        
        if (matchEmpresa && matchSucursal && matchUsuario) {
          console.log(`Venta ${v.VentaID}: fecha=${v.FechaHora} parseada=${fechaVenta.toISOString()} dentro=${dentroDelTurno} estatus=${v.Estatus}`);
        }
        
        return matchEmpresa && matchSucursal && matchUsuario && matchEstatus && dentroDelTurno;
      });
      console.log('Ventas filtradas:', ventas.length);
    } catch (e) { 
      console.error('Error en ventas:', e);
      ventas = []; 
    }
    
    let ventasTotales = 0, canceladas = 0, descuentos = 0, contado = 0, credito = 0;
    ventas.forEach(v => {
      const total = parseFloat(v.Total) || 0;
      if ((v.Estatus || '').toUpperCase() === 'CANCELADA') { canceladas += total; }
      else { ventasTotales += total; if (v.TipoVenta === 'CREDITO') credito += total; else contado += total; }
      descuentos += parseFloat(v.Descuentos) || 0;
    });
    
    // =====================================================
    // PAGOS/ABONOS
    // =====================================================
    let pagos = [];
    try {
      const todosPagos = await appsheet.find(CONFIG.TABLAS.ABONOS, '');
      console.log('');
      console.log('=== ABONOS ===');
      console.log('Total abonos en BD:', todosPagos.length);
      
      pagos = todosPagos.filter(p => {
        const matchEmpresa = String(p.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
        const matchSucursal = String(p.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
        const matchUsuario = String(p.UsuarioEmail || '').toLowerCase() === usuarioEmail.toLowerCase();
        const fechaPago = parsearFechaAppSheet(p.FechaHora || p.Fecha);
        const dentroDelTurno = fechaPago >= fechaInicioTurno && fechaPago <= ahora;
        
        console.log(`Abono ${p.AbonoID}: fecha=${p.FechaHora} parseada=${fechaPago.toISOString()} Emp=${matchEmpresa} Suc=${matchSucursal} Usr=${matchUsuario} dentro=${dentroDelTurno}`);
        
        return matchEmpresa && matchSucursal && matchUsuario && dentroDelTurno;
      });
      console.log('Abonos filtrados:', pagos.length);
    } catch (e) { 
      console.error('Error en abonos:', e);
      pagos = []; 
    }
    
    let efectivo = 0, tarjeta = 0, transferencia = 0, otros = 0;
    pagos.forEach(p => {
      const monto = parseFloat(p.Monto) || 0;
      const nombreMetodo = metodoMap[p.MetodoPagoID || p.MetodoPago || ''] || '';
      console.log(`  -> Procesando Abono ${p.AbonoID}: $${monto} metodo=${nombreMetodo}`);
      if (nombreMetodo.includes('efectivo') || nombreMetodo.includes('cash')) efectivo += monto;
      else if (nombreMetodo.includes('tarjeta') || nombreMetodo.includes('card')) tarjeta += monto;
      else if (nombreMetodo.includes('transferencia') || nombreMetodo.includes('transfer')) transferencia += monto;
      else otros += monto;
    });
    
    // =====================================================
    // MOVIMIENTOS
    // =====================================================
    console.log('');
    const movimientos = await getMovimientosTurno(horaInicio, empresaID, sucursalID, usuarioEmail);
    let ingresos = 0, egresos = 0;
    movimientos.forEach(m => { 
      if (m.tipo === 'Ingreso') ingresos += m.monto; 
      else if (m.tipo === 'Egreso') egresos += m.monto; 
    });
    
    // =====================================================
    // RESULTADO FINAL
    // =====================================================
    const efectivoEsperado = saldoInicial + efectivo + ingresos - egresos;
    
    console.log('');
    console.log('========================================');
    console.log('=== RESULTADO FINAL ===');
    console.log('========================================');
    console.log('saldoInicial:', saldoInicial);
    console.log('efectivo (de abonos):', efectivo);
    console.log('tarjeta:', tarjeta);
    console.log('transferencia:', transferencia);
    console.log('ingresos (movimientos):', ingresos);
    console.log('egresos (movimientos):', egresos);
    console.log('');
    console.log('*** EFECTIVO ESPERADO:', efectivoEsperado, '***');
    console.log('Formula:', saldoInicial, '+', efectivo, '+', ingresos, '-', egresos, '=', efectivoEsperado);
    console.log('========================================');
    console.log('');
    
    res.json({
      success: true,
      resumen: { 
        turnoID, horaInicio, saldoInicial, ventasTotales, canceladas, descuentos, 
        contado, credito, efectivo, tarjeta, transferencia, ingresos, egresos, otros, 
        efectivoEsperado, totalVentas: ventas.length, movimientos 
      }
    });
  } catch (e) { 
    console.error('Error en /resumen:', e);
    res.status(500).json({ success: false, error: e.message }); 
  }
});

// =====================================================
// Cerrar turno
// =====================================================
router.post('/cerrar', async (req, res) => {
  try {
    const data = req.body;
    
    console.log('');
    console.log('========================================');
    console.log('=== CERRAR TURNO ===');
    console.log('========================================');
    console.log('turnoID:', data.turnoID);
    console.log('empresaID:', data.empresaID);
    console.log('sucursalID:', data.sucursalID);
    console.log('usuarioEmail:', data.usuarioEmail);
    console.log('efectivoReal:', data.efectivoReal);
    
    const turnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, `Id="${data.turnoID}"`);
    if (turnos.length === 0) return res.json({ success: false, error: 'Turno no encontrado' });
    
    const turno = turnos[0];
    const horaInicio = turno.HoraInicio;
    const saldoInicial = parseFloat(turno.SaldoInicial) || 0;
    const efectivoReal = parseFloat(data.efectivoReal) || 0;
    const horaCierre = appsheet.fechaHoraActual();
    const fechaInicioTurno = parsearFechaAppSheet(horaInicio);
    const ahora = new Date();
    
    console.log('horaInicio (string):', horaInicio);
    console.log('fechaInicioTurno (parseada):', fechaInicioTurno.toISOString());
    
    // Métodos de pago
    let metodosPago = [];
    try { metodosPago = await appsheet.find(CONFIG.TABLAS.METODOS_PAGO, `EmpresaID="${data.empresaID}"`); } catch {}
    const metodoMap = {};
    metodosPago.forEach(m => { metodoMap[m.MetodoPagoID] = (m.Nombre || '').toLowerCase(); });
    
    // Ventas del turno
    let ventas = [];
    try {
      const todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
      ventas = todas.filter(v => {
        const matchEmpresa = String(v.EmpresaID || '').toLowerCase() === data.empresaID.toLowerCase();
        const matchSucursal = String(v.SucursalID || '').toLowerCase() === data.sucursalID.toLowerCase();
        const matchUsuario = String(v.UsuarioEmail || '').toLowerCase() === data.usuarioEmail.toLowerCase();
        const matchEstatus = (v.Estatus || '').toUpperCase() !== 'EN_ESPERA';
        const fechaVenta = parsearFechaAppSheet(v.FechaHora);
        const dentroDelTurno = fechaVenta >= fechaInicioTurno && fechaVenta <= ahora;
        return matchEmpresa && matchSucursal && matchUsuario && matchEstatus && dentroDelTurno;
      });
    } catch {}
    
    let ventasTotales = 0, canceladas = 0, descuentos = 0, contado = 0, credito = 0;
    ventas.forEach(v => {
      const total = parseFloat(v.Total) || 0;
      if ((v.Estatus || '').toUpperCase() === 'CANCELADA') canceladas += total;
      else { ventasTotales += total; if (v.TipoVenta === 'CREDITO') credito += total; else contado += total; }
      descuentos += parseFloat(v.Descuentos) || 0;
    });
    
    // Pagos del turno
    let pagos = [];
    try { 
      const todosPagos = await appsheet.find(CONFIG.TABLAS.ABONOS, ''); 
      pagos = todosPagos.filter(p => {
        const matchEmpresa = String(p.EmpresaID || '').toLowerCase() === data.empresaID.toLowerCase();
        const matchSucursal = String(p.SucursalID || '').toLowerCase() === data.sucursalID.toLowerCase();
        const matchUsuario = String(p.UsuarioEmail || '').toLowerCase() === data.usuarioEmail.toLowerCase();
        const fechaPago = parsearFechaAppSheet(p.FechaHora || p.Fecha);
        return matchEmpresa && matchSucursal && matchUsuario && fechaPago >= fechaInicioTurno && fechaPago <= ahora;
      });
    } catch {}
    
    let efectivo = 0, tarjeta = 0, transferencia = 0, otros = 0;
    pagos.forEach(p => {
      const monto = parseFloat(p.Monto) || 0;
      const nombreMetodo = metodoMap[p.MetodoPagoID || ''] || '';
      if (nombreMetodo.includes('efectivo')) efectivo += monto;
      else if (nombreMetodo.includes('tarjeta')) tarjeta += monto;
      else if (nombreMetodo.includes('transferencia')) transferencia += monto;
      else otros += monto;
    });
    
    // Movimientos del turno
    const movimientos = await getMovimientosTurno(horaInicio, data.empresaID, data.sucursalID, data.usuarioEmail);
    let ingresos = 0, egresos = 0;
    movimientos.forEach(m => { if (m.tipo === 'Ingreso') ingresos += m.monto; else if (m.tipo === 'Egreso') egresos += m.monto; });
    
    const efectivoEsperado = saldoInicial + efectivo + ingresos - egresos;
    
    console.log('');
    console.log('=== CIERRE CALCULADO ===');
    console.log('efectivoEsperado:', efectivoEsperado);
    console.log('efectivoReal:', efectivoReal);
    console.log('diferencia:', efectivoReal - efectivoEsperado);
    
    await appsheet.edit(CONFIG.TABLAS.ABRIR_TURNO, {
      Id: data.turnoID, VentasTotales: ventasTotales, Canceladas: canceladas, Descuentos: descuentos,
      Contado: contado, Credito: credito, Efectivo: efectivo, Tarjeta: tarjeta, Transferencia: transferencia,
      Depositos: ingresos, Retiros: egresos, Otros: otros, HoraCierre: horaCierre,
      EfectivoEsperado: efectivoEsperado, EfectivoReal: efectivoReal, Diferencia: efectivoReal - efectivoEsperado,
      EstadoActual: 'Cerrado', Observaciones: data.observaciones || ''
    });
    
    res.json({
      success: true, mensaje: 'Turno cerrado',
      resumen: { ventasTotales, canceladas, descuentos, contado, credito, efectivo, tarjeta, transferencia, ingresos, egresos, otros, efectivoEsperado },
      efectivoReal, diferencia: efectivoReal - efectivoEsperado
    });
  } catch (e) { 
    console.error('Error en /cerrar:', e);
    res.status(500).json({ success: false, error: e.message }); 
  }
});

module.exports = router;
```

Deploy y haz otro corte. Ahora el log debe mostrar claramente si el parseo de fechas está correcto. Busca estas líneas:
```
=== FECHAS DEL TURNO ===
horaInicio (string AppSheet): 12/29/2025 12:50:48
fechaInicioTurno (parseada): 2025-12-29T18:50:48.000Z  <-- debe ser 12:50 + 6 horas UTC
