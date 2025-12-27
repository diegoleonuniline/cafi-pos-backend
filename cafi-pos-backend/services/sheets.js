const { google } = require('googleapis');
const CONFIG = require('../config');

let sheetsClient = null;

const getClient = async () => {
  if (sheetsClient) return sheetsClient;
  
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
};

const getData = async (nombreHoja) => {
  const sheets = await getClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: nombreHoja
  });
  
  const datos = response.data.values;
  if (!datos || datos.length <= 1) return [];
  
  const headers = datos[0];
  return datos.slice(1).map(fila => {
    const obj = {};
    headers.forEach((h, j) => obj[h] = fila[j] || '');
    return obj;
  });
};

const esActivo = (valor) => {
  if (valor === true || valor === 1 || valor === 'Y') return true;
  if (typeof valor === 'string') {
    const v = valor.toLowerCase().trim();
    return ['true', '1', 'si', 'sí', 'yes', 'activo', 'y'].includes(v);
  }
  return false;
};

const compararID = (id1, id2) => {
  if (id1 == null || id2 == null) return false;
  return String(id1).trim().toLowerCase() === String(id2).trim().toLowerCase();
};

module.exports = { getData, esActivo, compararID };
