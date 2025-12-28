const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Buscar en AppSheet tabla Usuarios
    const usuarios = await appsheet.find('Usuarios', '');
    
    const usuario = usuarios.find(u => 
      String(u.UsuarioEmail || '').toLowerCase().trim() === String(email || '').toLowerCase().trim()
    );
    
    if (!usuario) return res.json({ success: false, error: 'Usuario no encontrado' });
    
    const passDB = String(usuario.Contraseña || usuario.Password || '');
    if (passDB !== String(password || '')) return res.json({ success: false, error: 'Contraseña incorrecta' });
    
    const activo = String(usuario.Activo || '').toUpperCase();
    if (activo !== 'Y' && activo !== 'TRUE' && activo !== '1') {
      return res.json({ success: false, error: 'Usuario inactivo' });
    }
    
    // Buscar empresa y sucursal
    const empresas = await appsheet.find('Empresas', '');
    const sucursales = await appsheet.find('Sucursales', '');
    
    const empresa = empresas.find(e => 
      String(e.EmpresaID || '').toLowerCase() === String(usuario.EmpresaID || '').toLowerCase()
    );
    const sucursal = sucursales.find(s => 
      String(s.SucursalID || '').toLowerCase() === String(usuario.SucursalID || '').toLowerCase()
    );
    
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
