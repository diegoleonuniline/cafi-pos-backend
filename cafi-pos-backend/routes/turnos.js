const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');
const CONFIG = require('../config');

// Verificar turno abierto
router.get('/verificar/:empresaID/:sucursalID/:usuarioEmail', async (req, res) => {
  try {
    const { empresaID, sucursalID, usuarioEmail } = req.params;
    const todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    
    const turnoAbierto = todosTurnos.find(t => {
      const matchEmpresa = String(t.Empresa || '').toLowerCase() === empresaID.toLowerCase();
      const matchSucursal = String(t.Sucursal || '').toLowerCase() === sucursalID.toLowerCase();
      const matchUsuario = String(t.Usuario || '').toLowerCase() === usuarioEmail.toLowerCase();
      const matchEstado = String(t.EstadoActual || '').toLowerCase() === 'abierto';
      return matchEmpresa && matchSucursal && matchUsuario && matchEstado;
    });
    
    if (turnoAbierto) {
      const movimientos = await getMovimientosTurno(turnoAbierto.Id);
      res.json({
        success: true,
        turnoAbierto: true,
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
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Abrir turno
router.post('/abrir', async (req, res) => {
  try {
    const data = req.body;
    
    // Verificar que no tenga turno abierto
    const todosTurnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, '');
    const yaAbierto = todosTurnos.find(t => {
      const matchEmpresa = String(t.Empresa || '').toLowerCase() === data.empresaID.toLowerCase();
      const matchSucursal = String(t.Sucursal || '').toLowerCase() === data.sucursalID.toLowerCase();
      const matchUsuario = String(t.Usuario || '').toLowerCase() === data.usuarioEmail.toLowerCase();
      const matchEstado = String(t.EstadoActual || '').toLowerCase() === 'abierto';
      return matchEmpresa && matchSucursal && matchUsuario && matchEstado;
    });
    
    if (yaAbierto) {
      return res.json({ success: false, error: 'Ya tienes un turno abierto' });
    }
    
    const turnoID = appsheet.generarID('').substring(0, 8);
    const horaInicio = appsheet.fechaHoraActual();
    
    const registro = {
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
    
    res.json({
      success: true,
      turnoID,
      horaInicio,
      saldoInicial: registro.SaldoInicial
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Registrar movimiento caja
router.post('/movimiento', async (req, res) => {
  try {
    const data = req.body;
    const movID = appsheet.generarID('').substring(0, 8);
    
    const registro = {
      ID: movID,
      Tipo: data.tipo,
      Usuario: data.usuarioEmail,
      Categoria: data.categoria || '',
      Concepto: data.concepto,
      Monto: parseFloat(data.monto) || 0,
      Observaciones: data.observaciones || ''
    };
    
    await appsheet.add(CONFIG.TABLAS.MOVIMIENTOS_CAJA, registro);
    
    res.json({ success: true, movimientoID: movID, movimiento: registro });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Calcular resumen turno
router.get('/resumen/:turnoID/:empresaID/:sucursalID/:usuarioEmail', async (req, res) => {
  try {
    const { turnoID, empresaID, sucursalID, usuarioEmail } = req.params;
    
    const turnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, `Id="${turnoID}"`);
    if (turnos.length === 0) {
      return res.json({ success: false, error: 'Turno no encontrado' });
    }
    
    const turno = turnos[0];
    const horaInicio = turno.HoraInicio;
    const saldoInicial = parseFloat(turno.SaldoInicial) || 0;
    
    // Métodos de pago
    let metodosPago = [];
    try {
      metodosPago = await appsheet.find(CONFIG.TABLAS.METODOS_PAGO, `EmpresaID="${empresaID}"`);
    } catch { metodosPago = []; }
    
    const metodoMap = {};
    metodosPago.forEach(m => { metodoMap[m.MetodoPagoID] = (m.Nombre || '').toLowerCase(); });
    
    // Ventas
    let ventas = [];
    try {
      const todas = await appsheet.find(CONFIG.TABLAS.VENTAS, '');
      ventas = todas.filter(v => {
        const matchEmpresa = String(v.EmpresaID || '').toLowerCase() === empresaID.toLowerCase();
        const matchSucursal = String(v.SucursalID || '').toLowerCase() === sucursalID.toLowerCase();
        const matchUsuario = String(v.UsuarioEmail || '').toLowerCase() === usuarioEmail.toLowerCase();
        const matchEstatus = (v.Estatus || '').toUpperCase() !== 'EN_ESPERA';
        return matchEmpresa && matchSucursal && matchUsuario && matchEstatus;
      });
    } catch { ventas = []; }
    
    let ventasTotales = 0, canceladas = 0, descuentos = 0, contado = 0, credito = 0;
    
    ventas.forEach(v => {
      const total = parseFloat(v.Total) || 0;
      const estatus = (v.Estatus || '').toUpperCase();
      
      if (estatus === 'CANCELADA') {
        canceladas += total;
      } else {
        ventasTotales += total;
        if (v.TipoVenta === 'CREDITO') credito += total;
        else contado += total;
      }
      descuentos += parseFloat(v.Descuentos) || 0;
    });
    
    // Pagos
    let pagos = [];
    try {
      const todosPagos = await appsheet.find(CONFIG.TABLAS.ABONOS, '');
      pagos = todosPagos.filter(p => String(p.EmpresaID || '').toLowerCase() === empresaID.toLowerCase());
    } catch { pagos = []; }
    
    let efectivo = 0, tarjeta = 0, transferencia = 0, otros = 0;
    
    pagos.forEach(p => {
      const monto = parseFloat(p.Monto) || 0;
      const metodoID = p.MetodoPagoID || p.MetodoPago || '';
      const nombreMetodo = metodoMap[metodoID] || metodoID.toLowerCase();
      
      if (nombreMetodo.includes('efectivo') || nombreMetodo.includes('cash')) efectivo += monto;
      else if (nombreMetodo.includes('tarjeta') || nombreMetodo.includes('card')) tarjeta += monto;
      else if (nombreMetodo.includes('transferencia') || nombreMetodo.includes('transfer')) transferencia += monto;
      else otros += monto;
    });
    
    // Movimientos
    const movimientos = await getMovimientosTurno(turnoID);
    let ingresos = 0, egresos = 0;
    
    movimientos.forEach(m => {
      if (m.tipo === 'Ingreso') ingresos += m.monto;
      else if (m.tipo === 'Egreso') egresos += m.monto;
    });
    
    const efectivoEsperado = saldoInicial + efectivo + ingresos - egresos;
    
    res.json({
      success: true,
      resumen: {
        turnoID,
        horaInicio,
        saldoInicial,
        ventasTotales,
        canceladas,
        descuentos,
        contado,
        credito,
        efectivo,
        tarjeta,
        transferencia,
        ingresos,
        egresos,
        otros,
        efectivoEsperado,
        totalVentas: ventas.length,
        movimientos
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Cerrar turno
router.post('/cerrar', async (req, res) => {
  try {
    const data = req.body;
    
    // Calcular resumen
    const resumenRes = await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/turnos/resumen/${data.turnoID}/${data.empresaID}/${data.sucursalID}/${data.usuarioEmail}`);
    const resumenData = await resumenRes.json();
    
    if (!resumenData.success) {
      return res.json(resumenData);
    }
    
    const r = resumenData.resumen;
    const efectivoReal = parseFloat(data.efectivoReal) || 0;
    const horaCierre = appsheet.fechaHoraActual();
    
    const actualizacion = {
      Id: data.turnoID,
      VentasTotales: r.ventasTotales,
      Canceladas: r.canceladas,
      Descuentos: r.descuentos,
      Contado: r.contado,
      Credito: r.credito,
      Efectivo: r.efectivo,
      Tarjeta: r.tarjeta,
      Transferencia: r.transferencia,
      Depositos: r.ingresos,
      Retiros: r.egresos,
      Otros: r.otros,
      HoraCierre: horaCierre,
      EfectivoEsperado: r.efectivoEsperado,
      EfectivoReal: efectivoReal,
      Diferencia: efectivoReal - r.efectivoEsperado,
      EstadoActual: 'Cerrado',
      Observaciones: data.observaciones || ''
    };
    
    await appsheet.edit(CONFIG.TABLAS.ABRIR_TURNO, actualizacion);
    
    res.json({
      success: true,
      mensaje: 'Turno cerrado correctamente',
      resumen: r,
      efectivoReal,
      diferencia: efectivoReal - r.efectivoEsperado
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Helper
async function getMovimientosTurno(turnoID) {
  try {
    const turnos = await appsheet.find(CONFIG.TABLAS.ABRIR_TURNO, `Id="${turnoID}"`);
    if (turnos.length === 0) return [];
    
    const turno = turnos[0];
    const usuario = turno.Usuario;
    
    const movimientos = await appsheet.find(CONFIG.TABLAS.MOVIMIENTOS_CAJA, '');
    
    return movimientos
      .filter(m => String(m.Usuario || '').toLowerCase() === usuario.toLowerCase())
      .map(m => ({
        id: m.ID,
        tipo: m.Tipo,
        categoria: m.Categoria,
        concepto: m.Concepto,
        monto: parseFloat(m.Monto) || 0,
        fecha: m.FechaRegistro,
        observaciones: m.Observaciones
      }));
  } catch {
    return [];
  }
}

module.exports = router;
