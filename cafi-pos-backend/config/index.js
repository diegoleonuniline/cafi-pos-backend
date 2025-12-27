module.exports = {
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '1vRt9kIcJcAz9qR_jaF2hC6vWZoETOdc3oceQP-Cc6fI',
  
  APPSHEET: {
    APP_ID: process.env.APPSHEET_APP_ID || '6d31d701-1278-4e8e-aefe-dfa42934844f',
    API_KEY: process.env.APPSHEET_API_KEY || 'V2-PvwFa-S9mop-1PPxo-LVX2P-yQKez-Y2zIw-g9ePc-xqiop',
    BASE_URL: 'https://api.appsheet.com/api/v2/apps/'
  },
  
  HOJAS: {
    USUARIOS: 'Usuarios',
    EMPRESAS: 'Empresas',
    SUCURSALES: 'Sucursales'
  },
  
  TABLAS: {
    PRODUCTOS: 'Productos',
    CLIENTES: 'Clientes',
    PROVEEDORES: 'Proveedores',
    METODOS_PAGO: 'MetodosPago',
    VENTAS: 'Ventas',
    DETALLE_VENTA: 'DetalleVenta',
    ABONOS: 'Abonos',
    ABRIR_TURNO: 'AbrirTurno',
    MOVIMIENTOS_CAJA: 'MovimientosCaja'
  }
};
