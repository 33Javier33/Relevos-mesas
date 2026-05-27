// ============================================================
// Google Apps Script — Horario de Relevos
// Spreadsheet ID: 1PnNxRq67-hXLsayyB7GoKcHaNpm3tWoDvYaHgLLdZ6g
// ============================================================

const SPREADSHEET_ID = '1PnNxRq67-hXLsayyB7GoKcHaNpm3tWoDvYaHgLLdZ6g';
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

const STATS_HEADERS = [
  'Fecha', 'Croupier', 'Mesa', 'Minutos en Mesa',
  'Minutos Ayudante', 'Minutos Descanso', 'Total Minutos',
  'Mesa Principal', '% Tiempo en Mesa', '% Descanso'
];
const LOG_HEADERS = ['Fecha', 'Croupier', 'Horario', 'Actividad', 'Mesas', 'Color'];
const SOLICITUDES_HEADERS = ['ID','Fecha','FechaTurno','Supervisor','Mesa','Croupier','Tipo','Descripcion','Estado','Respuesta','FechaRespuesta'];

// ============================================================
// GET — Leer datos
// ============================================================
function doGet(e) {
  const action = e.parameter.action;
  if (action === 'load')        return cargarHorario(e.parameter.fecha);
  if (action === 'stats')       return obtenerEstadisticas(e.parameter.fecha);
  if (action === 'solicitudes') return obtenerSolicitudes_(e.parameter.fecha, e.parameter.estado);
  return jsonResponse({ found: false, message: 'Acción no válida.' });
}

function cargarHorario(fecha) {
  if (!fecha) return jsonResponse({ found: false, message: 'Fecha requerida.' });
  const sheet = ss.getSheetByName(fecha);
  if (!sheet) return jsonResponse({ found: false, message: 'No se encontró hoja para: ' + fecha });
  try {
    const raw = sheet.getRange('A1').getValue();
    if (!raw) return jsonResponse({ found: false, message: 'Hoja vacía.' });
    const data = JSON.parse(raw);
    data.found = true;
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ found: false, message: 'Error al procesar datos.', error: err.toString() });
  }
}

function obtenerEstadisticas(fecha) {
  if (!fecha) return jsonResponse({ found: false, message: 'Fecha requerida.' });
  const sheet = ss.getSheetByName(fecha);
  if (!sheet) return jsonResponse({ found: false, message: 'Sin datos para: ' + fecha });
  try {
    const raw = sheet.getRange('A1').getValue();
    if (!raw) return jsonResponse({ found: false });
    const data = JSON.parse(raw);
    const stats = calcularEstadisticasGAS(data);
    return jsonResponse({ found: true, fecha, stats });
  } catch (err) {
    return jsonResponse({ found: false, error: err.toString() });
  }
}

// ============================================================
// POST — Guardar datos y acciones
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Enrutamiento por acción
    if (data.action === 'login')             return validarLogin(data.role, data.password);
    if (data.action === 'solicitud')         return crearSolicitud(data);
    if (data.action === 'responderSolicitud') return responderSolicitud_(data);
    if (data.action === 'updateConfig')      return actualizarConfig(data);

    // Comportamiento por defecto: guardar horario
    const fecha = data.fecha;
    if (!fecha) return jsonResponse({ success: false, message: 'Fecha requerida.' });

    let sheet = ss.getSheetByName(fecha);
    if (!sheet) sheet = ss.insertSheet(fecha, 0);

    const dataToStore = {
      horarios:         data.horarios         || [],
      datosRelevos:     data.datosRelevos     || {},
      croupiersEnTabla: data.croupiersEnTabla || [],
      croupierColors:   data.croupierColors   || {},
      horarioColors:    data.horarioColors    || {},
      horasSalida:      data.horasSalida      || {},
      cronometros:      data.cronometros      || {}
    };

    sheet.getRange('A1').setValue(JSON.stringify(dataToStore));
    escribirLogHoja(sheet, dataToStore, fecha);
    actualizarHojaEstadisticas(dataToStore, fecha);

    return jsonResponse({ success: true, message: 'Guardado en hoja: ' + fecha });
  } catch (err) {
    return jsonResponse({ success: false, message: 'Error en servidor.', error: err.toString() });
  }
}

// ============================================================
// Auth — Config y login
// ============================================================
function obtenerConfig() {
  let sheet = ss.getSheetByName('Config');
  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange('A1:B2').setValues([
      ['operador_pass',  '2026'],
      ['supervisor_pass', '1234']
    ]);
    sheet.getRange('A1:B1').setFontWeight('bold');
  }
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const values  = sheet.getRange('A1:B' + lastRow).getValues();
  const config  = {};
  values.forEach(row => { if (row[0]) config[row[0]] = String(row[1]); });
  return config;
}

function validarLogin(role, password) {
  if (!role || !password) return jsonResponse({ success: false, message: 'Datos incompletos.' });
  const config = obtenerConfig();
  const key = role === 'operador' ? 'operador_pass' : 'supervisor_pass';
  if (!config[key]) return jsonResponse({ success: false, message: 'Rol no configurado.' });
  if (String(password) === String(config[key])) return jsonResponse({ success: true, role });
  return jsonResponse({ success: false, message: 'Contraseña incorrecta.' });
}

function actualizarConfig(data) {
  const config = obtenerConfig();
  if (String(data.passActual) !== String(config.operador_pass)) {
    return jsonResponse({ success: false, message: 'Contraseña actual incorrecta.' });
  }
  const sheet = ss.getSheetByName('Config');
  const values = sheet.getRange('A1:B' + sheet.getLastRow()).getValues();
  values.forEach((row, i) => {
    if (row[0] === 'operador_pass'  && data.nuevaOperador)   sheet.getRange(i + 1, 2).setValue(data.nuevaOperador);
    if (row[0] === 'supervisor_pass' && data.nuevaSupervisor) sheet.getRange(i + 1, 2).setValue(data.nuevaSupervisor);
  });
  return jsonResponse({ success: true });
}

// ============================================================
// Solicitudes
// ============================================================
function obtenerHojaSolicitudes() {
  let sheet = ss.getSheetByName('Solicitudes');
  if (!sheet) {
    sheet = ss.insertSheet('Solicitudes');
    const h = sheet.getRange(1, 1, 1, SOLICITUDES_HEADERS.length);
    h.setValues([SOLICITUDES_HEADERS]);
    h.setBackground('#1a73e8');
    h.setFontColor('#ffffff');
    h.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function crearSolicitud(data) {
  try {
    const sheet = obtenerHojaSolicitudes();
    const id = Date.now().toString();
    sheet.appendRow([
      id,
      new Date().toISOString(),
      data.fechaTurno   || '',
      data.supervisor   || 'Supervisor',
      data.mesa         || '',
      data.croupier     || '',
      data.tipo         || 'Nota',
      data.descripcion  || '',
      'pendiente', '', ''
    ]);
    return jsonResponse({ success: true, id });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function obtenerSolicitudes_(fecha, estado) {
  try {
    const sheet = ss.getSheetByName('Solicitudes');
    if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ found: true, solicitudes: [] });

    const tz = Session.getScriptTimeZone();
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, SOLICITUDES_HEADERS.length).getValues();
    let list = rows.map(row => {
      const obj = {};
      SOLICITUDES_HEADERS.forEach((h, i) => {
        let val = row[i];
        // Google Sheets may auto-convert date strings to Date objects
        if (val instanceof Date) {
          val = Utilities.formatDate(val, tz, 'yyyy-MM-dd');
        } else {
          val = val !== undefined && val !== null ? val.toString() : '';
        }
        obj[h.toLowerCase()] = val;
      });
      return obj;
    }).filter(s => s.id);

    if (fecha)  list = list.filter(s => s.fechaturno === fecha);
    if (estado) list = list.filter(s => s.estado === estado);

    return jsonResponse({ found: true, solicitudes: list.reverse() });
  } catch (err) {
    return jsonResponse({ found: false, error: err.toString() });
  }
}

function responderSolicitud_(data) {
  try {
    const sheet = ss.getSheetByName('Solicitudes');
    if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ success: false });

    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0].toString() === data.id.toString()) {
        const row = i + 2;
        sheet.getRange(row, 9).setValue(data.estado   || 'aprobado');
        sheet.getRange(row, 10).setValue(data.respuesta || '');
        sheet.getRange(row, 11).setValue(new Date().toISOString());
        return jsonResponse({ success: true });
      }
    }
    return jsonResponse({ success: false, message: 'Solicitud no encontrada.' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ============================================================
// Log de relevos en columnas C+ de la hoja del día
// ============================================================
function escribirLogHoja(sheet, data, fecha) {
  try {
    const { horarios, datosRelevos, croupiersEnTabla } = data;
    if (!horarios || !horarios.length || !croupiersEnTabla || !croupiersEnTabla.length) return;

    const sorted = horarios.slice().sort(sortHorariosGAS);
    const rows = [LOG_HEADERS];

    sorted.forEach(hora => {
      croupiersEnTabla.forEach(croupier => {
        const entry = datosRelevos[croupier] && datosRelevos[croupier][hora];
        if (!entry) return;
        rows.push([fecha, croupier, hora, entry.actividad || '', entry.mesas ? entry.mesas.join(', ') : '', entry.color || '']);
      });
    });

    if (rows.length <= 1) return;

    const startCol = 3;
    sheet.getRange(1, startCol, rows.length, LOG_HEADERS.length).setValues(rows);
    const h = sheet.getRange(1, startCol, 1, LOG_HEADERS.length);
    h.setBackground('#4a90d9');
    h.setFontColor('#ffffff');
    h.setFontWeight('bold');
  } catch (err) {
    Logger.log('escribirLogHoja error: ' + err);
  }
}

// ============================================================
// Hoja "Estadísticas"
// ============================================================
function actualizarHojaEstadisticas(data, fecha) {
  try {
    const stats = calcularEstadisticasGAS(data);
    if (!stats || !stats.length) return;

    let statsSheet = ss.getSheetByName('Estadísticas');
    if (!statsSheet) {
      statsSheet = ss.insertSheet('Estadísticas');
      statsSheet.getRange(1, 1, 1, STATS_HEADERS.length).setValues([STATS_HEADERS]);
      const h = statsSheet.getRange(1, 1, 1, STATS_HEADERS.length);
      h.setBackground('#1a73e8');
      h.setFontColor('#ffffff');
      h.setFontWeight('bold');
      statsSheet.setFrozenRows(1);
    }

    const lastRow = statsSheet.getLastRow();
    if (lastRow > 1) {
      const fechaCol = statsSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = fechaCol.length - 1; i >= 0; i--) {
        if (fechaCol[i][0] === fecha) statsSheet.deleteRow(i + 2);
      }
    }

    stats.forEach(row => statsSheet.appendRow(row));
    statsSheet.autoResizeColumns(1, STATS_HEADERS.length);
  } catch (err) {
    Logger.log('actualizarHojaEstadisticas error: ' + err);
  }
}

// ============================================================
// Cálculo de estadísticas
// ============================================================
function calcularEstadisticasGAS(data) {
  const { horarios, datosRelevos, croupiersEnTabla } = data;
  if (!horarios || !croupiersEnTabla) return [];

  const sorted = horarios.slice().sort(sortHorariosGAS);

  function toMin(h) {
    const parts = h.split(':');
    const hr = parseInt(parts[0], 10);
    const mn = parseInt(parts[1], 10);
    return (hr < 6 ? hr + 24 : hr) * 60 + mn;
  }

  const porCroupier = {};
  croupiersEnTabla.forEach(c => {
    porCroupier[c] = { minutosMesa: {}, minutosAyudante: 0, minutosDescanso: 0, total: 0 };
  });

  sorted.forEach((hora, idx) => {
    const dur = idx < sorted.length - 1 ? toMin(sorted[idx + 1]) - toMin(hora) : 30;
    if (dur <= 0) return;
    croupiersEnTabla.forEach(c => {
      const entry = datosRelevos[c] && datosRelevos[c][hora];
      if (!entry) return;
      porCroupier[c].total += dur;
      if (entry.actividad === 'releva' && entry.mesas && entry.mesas.length) {
        const perMesa = Math.round(dur / entry.mesas.length);
        entry.mesas.forEach(mesa => {
          porCroupier[c].minutosMesa[mesa] = (porCroupier[c].minutosMesa[mesa] || 0) + perMesa;
        });
      } else if (entry.actividad === 'ayudante-pagador') {
        porCroupier[c].minutosAyudante += dur;
      } else if (entry.actividad === 'descanso') {
        porCroupier[c].minutosDescanso += dur;
      }
    });
  });

  const rows = [];
  croupiersEnTabla.forEach(c => {
    const d = porCroupier[c];
    if (d.total === 0) return;
    const mesasEntries   = Object.entries(d.minutosMesa);
    const mesaPrincipal  = mesasEntries.length ? mesasEntries.sort((a, b) => b[1] - a[1])[0][0] : '';
    const minMesaPpal    = mesaPrincipal ? d.minutosMesa[mesaPrincipal] : 0;
    const totalMesa      = mesasEntries.reduce((s, [, v]) => s + v, 0);
    const pctMesa        = d.total > 0 ? Math.round(totalMesa / d.total * 100) : 0;
    const pctDesc        = d.total > 0 ? Math.round(d.minutosDescanso / d.total * 100) : 0;
    rows.push([fecha, c, mesasPorCroupier(d.minutosMesa), minMesaPpal, d.minutosAyudante, d.minutosDescanso, d.total, mesaPrincipal, pctMesa, pctDesc]);
  });

  return rows;
}

function mesasPorCroupier(minutosMesa) {
  return Object.entries(minutosMesa).sort((a, b) => b[1] - a[1]).map(([m, min]) => m + ':' + min + 'm').join(', ');
}

function sortHorariosGAS(a, b) {
  const parts = h => { const p = h.split(':'); let hr = parseInt(p[0], 10); if (hr < 6) hr += 24; return hr * 60 + parseInt(p[1], 10); };
  return parts(a) - parts(b);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
