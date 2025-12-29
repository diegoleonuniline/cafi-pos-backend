const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');
const CONFIG = require('../config');

// Helper - Movimientos del turno (filtrados por fecha, empresa, sucursal, usuario)
async function getMovimientosTurno(horaInicio, empresaID, sucursalID, usuarioEmail) {
  try {
    const movimientos = await appsheet.find(CONFIG.TABLAS.MOVIMIENTOS_CAJA, '');
    const inicio = new Date(horaInicio);
    const ahora = new Date();
    
    return movimientos
      .filter(m => {
        const matchEmpresa = String(m.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
        const matchSucursal = String(m.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
        const matchUsuario = String(m.Usuario || '').toLowerCase() === usuarioEmail.toLowerCase();
        const fechaMov = new Date(m.FechaRegistro || m.Fecha);
        const dentroDelTurno = fechaMov >= inicio && fechaMov <= ahora;
        return matchEmpresa && matchSucursal && matchUsuario && dentroDelTurno;
      })
      .map(m => ({
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

// Verificar turno abierto
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

// Abrir turno
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

// Movimiento caja - AHORA GUARDA EmpresaID y SucursalID
router.post('/movimiento', async (req, res) => {
  try {
    const data = req.body;
    
    // Obtener turno activo para sacar Empresa y Sucursal
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

// Resumen turno (POST) - FILTRADO COMPLETO POR FECHA, EMPRESA, SUCURSAL, USUARIO
router.post('/resumen', async (req, res) => {
  try {
    const { turnoID, empresaID, sucursalID, usuarioEmail } = req.body;
    const turnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, `Id="${turnoID}"`);
    if (turnos.length === 0) return res.json({ success: false, error: 'Turno no encontrado' });
    
    const turno = turnos[0];
    const horaInicio = turno.HoraInicio;
    const saldoInicial = parseFloat(turno.SaldoInicial) || 0;
    const fechaInicioTurno = new Date(horaInicio);
    const ahora = new Date();
    
    // Métodos de pago
    let metodosPago = [];
    try { metodosPago = await appsheet.find(CONFIG.TABLAS.METODOS_PAGO, `EmpresaID="${empresaID}"`); } catch { metodosPago = []; }
    const metodoMap = {};
    metodosPago.forEach(m => { metodoMap[m.MetodoPagoID] = (m.Nombre || '').toLowerCase(); });
    
    // Ventas - FILTRAR POR FECHA + EMPRESA + SUCURSAL + USUARIO
    let ventas = [];
    try {
      const todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
      ventas = todas.filter(v => {
        const matchEmpresa = String(v.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
        const matchSucursal = String(v.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
        const matchUsuario = String(v.UsuarioEmail || '').toLowerCase() === usuarioEmail.toLowerCase();
        const matchEstatus = (v.Estatus || '').toUpperCase() !== 'EN_ESPERA';
        const fechaVenta = new Date(v.FechaHora);
        const dentroDelTurno = fechaVenta >= fechaInicioTurno && fechaVenta <= ahora;
        return matchEmpresa && matchSucursal && matchUsuario && matchEstatus && dentroDelTurno;
      });
    } catch { ventas = []; }
    
    let ventasTotales = 0, canceladas = 0, descuentos = 0, contado = 0, credito = 0;
    ventas.forEach(v => {
      const total = parseFloat(v.Total) || 0;
      if ((v.Estatus || '').toUpperCase() === 'CANCELADA') { canceladas += total; }
      else { ventasTotales += total; if (v.TipoVenta === 'CREDITO') credito += total; else contado += total; }
      descuentos += parseFloat(v.Descuentos) || 0;
    });
    
    // Pagos/Abonos - FILTRAR POR FECHA + EMPRESA + SUCURSAL + USUARIO
    let pagos = [];
    try {
      const todosPagos = await appsheet.find(CONFIG.TABLAS.ABONOS, '');
      pagos = todosPagos.filter(p => {
        const matchEmpresa = String(p.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
        const matchSucursal = String(p.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
        const matchUsuario = String(p.UsuarioEmail || '').toLowerCase() === usuarioEmail.toLowerCase();
        const fechaPago = new Date(p.FechaHora || p.Fecha);
        const dentroDelTurno = fechaPago >= fechaInicioTurno && fechaPago <= ahora;
        return matchEmpresa && matchSucursal && matchUsuario && dentroDelTurno;
      });
    } catch { pagos = []; }
    
    let efectivo = 0, tarjeta = 0, transferencia = 0, otros = 0;
    pagos.forEach(p => {
      const monto = parseFloat(p.Monto) || 0;
      const nombreMetodo = metodoMap[p.MetodoPagoID || p.MetodoPago || ''] || '';
      if (nombreMetodo.includes('efectivo') || nombreMetodo.includes('cash')) efectivo += monto;
      else if (nombreMetodo.includes('tarjeta') || nombreMetodo.includes('card')) tarjeta += monto;
      else if (nombreMetodo.includes('transferencia') || nombreMetodo.includes('transfer')) transferencia += monto;
      else otros += monto;
    });
    
    // Movimientos - FILTRAR POR FECHA + EMPRESA + SUCURSAL + USUARIO
    const movimientos = await getMovimientosTurno(horaInicio, empresaID, sucursalID, usuarioEmail);
    let ingresos = 0, egresos = 0;
    movimientos.forEach(m => { if (m.tipo === 'Ingreso') ingresos += m.monto; else if (m.tipo === 'Egreso') egresos += m.monto; });
    
    const efectivoEsperado = saldoInicial + efectivo + ingresos - egresos;
    
    res.json({
      success: true,
      resumen: { 
        turnoID, horaInicio, saldoInicial, ventasTotales, canceladas, descuentos, 
        contado, credito, efectivo, tarjeta, transferencia, ingresos, egresos, otros, 
        efectivoEsperado, totalVentas: ventas.length, movimientos 
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Cerrar turno
router.post('/cerrar', async (req, res) => {
  try {
    const data = req.body;
    const turnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, `Id="${data.turnoID}"`);
    if (turnos.length === 0) return res.json({ success: false, error: 'Turno no encontrado' });
    
    const turno = turnos[0];
    const horaInicio = turno.HoraInicio;
    const saldoInicial = parseFloat(turno.SaldoInicial) || 0;
    const efectivoReal = parseFloat(data.efectivoReal) || 0;
    const horaCierre = appsheet.fechaHoraActual();
    const fechaInicioTurno = new Date(horaInicio);
    const ahora = new Date();
    
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
        const fechaVenta = new Date(v.FechaHora);
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
    
    // Pagos del turno - CON FILTRO DE SUCURSAL
    let pagos = [];
    try { 
      const todosPagos = await appsheet.find(CONFIG.TABLAS.ABONOS, ''); 
      pagos = todosPagos.filter(p => {
        const matchEmpresa = String(p.EmpresaID || '').toLowerCase() === data.empresaID.toLowerCase();
        const matchSucursal = String(p.SucursalID || '').toLowerCase() === data.sucursalID.toLowerCase();
        const matchUsuario = String(p.UsuarioEmail || '').toLowerCase() === data.usuarioEmail.toLowerCase();
        const fechaPago = new Date(p.FechaHora || p.Fecha);
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
    
    // Movimientos del turno - CON FILTROS COMPLETOS
    const movimientos = await getMovimientosTurno(horaInicio, data.empresaID, data.sucursalID, data.usuarioEmail);
    let ingresos = 0, egresos = 0;
    movimientos.forEach(m => { if (m.tipo === 'Ingreso') ingresos += m.monto; else if (m.tipo === 'Egreso') egresos += m.monto; });
    
    const efectivoEsperado = saldoInicial + efectivo + ingresos - egresos;
    
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
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
