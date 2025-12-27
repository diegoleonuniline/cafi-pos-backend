const express = require('express');
const router = express.Router();
const sheets = require('../services/sheets');
const CONFIG = require('../config');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const usuarios = await sheets.getData(CONFIG.HOJAS.USUARIOS);
    const usuario = usuarios.find(u => 
      String(u.UsuarioEmail || '').toLowerCase().trim() === String(email || '').toLowerCase().trim()
    );
    
    if (!usuario) return res.json({ success: false, error: 'Usuario no encontrado' });
    
    const passDB = String(usuario.Contraseña || usuario.Password || '');
    if (passDB !== String(password || '')) return res.json({ success: false, error: 'Contraseña incorrecta' });
    if (!sheets.esActivo(usuario.Activo)) return res.json({ success: false, error: 'Usuario inactivo' });
    
    const empresas = await sheets.getData(CONFIG.HOJAS.EMPRESAS);
    const sucursales = await sheets.getData(CONFIG.HOJAS.SUCURSALES);
    
    const empresa = empresas.find(e => sheets.compararID(e.EmpresaID, usuario.EmpresaID));
    const sucursal = sucursales.find(s => sheets.compararID(s.SucursalID, usuario.SucursalID));
    
    res.json({
      success: true,
      usuario: {
        email: usuario.UsuarioEmail,
        nombre: usuario.Nombre,
        rol: usuario.Rol,
        empresaID: usuario.EmpresaID,
        sucursalID: usuario.SucursalID,
        empresaNombre: empresa?.NombreEmpresa || String(usuario.EmpresaID),
        sucursalNombre: sucursal?.NombreSucursal || String(usuario.SucursalID)
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
