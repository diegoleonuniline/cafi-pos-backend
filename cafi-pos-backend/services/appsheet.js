const CONFIG = require('../config');
const { v4: uuidv4 } = require('uuid');

const request = async (tabla, action, data = {}) => {
  const url = `${CONFIG.APPSHEET.BASE_URL}${CONFIG.APPSHEET.APP_ID}/tables/${tabla}/Action`;
  
  const payload = {
    Action: action,
    Properties: {
      Locale: 'es-MX',
      Timezone: 'America/Mexico_City'
    },
    ...data
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ApplicationAccessKey': CONFIG.APPSHEET.API_KEY
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`Error API AppSheet: ${await response.text()}`);
  }
  
  const text = await response.text();
  if (!text || text.trim() === '') return { success: true };
  
  try {
    return JSON.parse(text);
  } catch {
    return { success: true };
  }
};

const find = async (tabla, selector = '') => {
  const result = await request(tabla, 'Find', { Rows: [], Selector: selector });
  return Array.isArray(result) ? result : [];
};

const findFiltered = async (tabla, empresaID, extraFilter = null) => {
  const todos = await find(tabla, '');
  return todos.filter(row => {
    const matchEmpresa = String(row.EmpresaID || '').toLowerCase() === String(empresaID).toLowerCase();
    const matchActivo = String(row.Activo || '').toUpperCase() === 'Y';
    const matchExtra = extraFilter ? extraFilter(row) : true;
    return matchEmpresa && matchActivo && matchExtra;
  });
};

const add = async (tabla, row) => request(tabla, 'Add', { Rows: [row] });
const edit = async (tabla, row) => request(tabla, 'Edit', { Rows: [row] });
const remove = async (tabla, row) => request(tabla, 'Delete', { Rows: [row] });

const generarID = (prefijo) => `${prefijo}_${uuidv4().substring(0, 8).toUpperCase()}`;

const fechaHoy = () => {
  const hoy = new Date();
  return hoy.toISOString().split('T')[0];
};

const fechaHoraActual = () => {
  const ahora = new Date();
  return ahora.toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' }).replace('T', ' ');
};

module.exports = {
  request,
  find,
  findFiltered,
  add,
  edit,
  remove,
  generarID,
  fechaHoy,
  fechaHoraActual
};
