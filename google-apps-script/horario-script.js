// ============================================================
// Google Apps Script — Horario de Relevos
// Spreadsheet ID: 1PnNxRq67-hXLsayyB7GoKcHaNpm3tWoDvYaHgLLdZ6g
// ============================================================

const SPREADSHEET_ID = '1PnNxRq67-hXLsayyB7GoKcHaNpm3tWoDvYaHgLLdZ6g';
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

// ── Encabezados de la hoja de estadísticas ──────────────────
const STATS_HEADERS = [
  'Fecha', 'Croupier', 'Mesa', 'Minutos en Mesa',
  'Minutos Ayudante', 'Minutos Descanso', 'Total Minutos',
  'Mesa Principal', '% Tiempo en Mesa', '% Descanso'
];

// ── Encabezados de la hoja de log de relevos ────────────────
const LOG_HEADERS = [
  'Fecha', 'Croupier', 'Horario', 'Actividad', 'Mesas', 'Color'
];

// ============================================================
// GET — Leer datos
// ============================================================
function doGet(e) {
  const action = e.parameter.action;

  if (action === 'load') {
    return cargarHorario(e.parameter.fecha);
  }

  if (action === 'stats') {
    return obtenerEstadisticas(e.parameter.fecha);
  }

  return jsonResponse({ found: false, message: 'Acción no válida.' });
}

// ── Carga el horario de una fecha ───────────────────────────
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

// ── Devuelve estadísticas calculadas de una fecha ───────────
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
// POST — Guardar datos
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const fecha = data.fecha;
    if (!fecha) return jsonResponse({ success: false, message: 'Fecha requerida.' });

    // Hoja principal de datos
    let sheet = ss.getSheetByName(fecha);
    if (!sheet) {
      sheet = ss.insertSheet(fecha, 0);
    }

    const dataToStore = {
      horarios:        data.horarios        || [],
      datosRelevos:    data.datosRelevos    || {},
      croupiersEnTabla: data.croupiersEnTabla || [],
      croupierColors:  data.croupierColors  || {},
      horarioColors:   data.horarioColors   || {},
      horasSalida:     data.horasSalida     || {},
      cronometros:     data.cronometros     || {}
    };

    sheet.getRange('A1').setValue(JSON.stringify(dataToStore));

    // Escribe log detallado a partir de la columna C (no sobreescribe datos)
    escribirLogHoja(sheet, dataToStore, fecha);

    // Actualiza hoja global de estadísticas
    actualizarHojaEstadisticas(dataToStore, fecha);

    return jsonResponse({ success: true, message: 'Guardado en hoja: ' + fecha });
  } catch (err) {
    return jsonResponse({ success: false, message: 'Error en servidor.', error: err.toString() });
  }
}

// ============================================================
// Escribe el log de relevos en columnas C+ de la hoja del día
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
        rows.push([
          fecha,
          croupier,
          hora,
          entry.actividad || '',
          entry.mesas ? entry.mesas.join(', ') : '',
          entry.color || ''
        ]);
      });
    });

    if (rows.length <= 1) return;

    // Escribir a partir de C1
    const startCol = 3;
    const range = sheet.getRange(1, startCol, rows.length, LOG_HEADERS.length);
    range.setValues(rows);

    // Formato encabezado
    const headerRange = sheet.getRange(1, startCol, 1, LOG_HEADERS.length);
    headerRange.setBackground('#4a90d9');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
  } catch (err) {
    Logger.log('escribirLogHoja error: ' + err);
  }
}

// ============================================================
// Actualiza / crea hoja "Estadísticas" con resumen por fecha
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

    // Borra filas anteriores de esta fecha
    const lastRow = statsSheet.getLastRow();
    if (lastRow > 1) {
      const fechaCol = statsSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = fechaCol.length - 1; i >= 0; i--) {
        if (fechaCol[i][0] === fecha) statsSheet.deleteRow(i + 2);
      }
    }

    // Inserta nuevas filas
    stats.forEach(row => statsSheet.appendRow(row));

    // Auto-resize columnas
    statsSheet.autoResizeColumns(1, STATS_HEADERS.length);
  } catch (err) {
    Logger.log('actualizarHojaEstadisticas error: ' + err);
  }
}

// ============================================================
// Calcula estadísticas desde los datos del horario
// Retorna array de filas listas para Google Sheets
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

  // Acumular por croupier
  const porCroupier = {};
  croupiersEnTabla.forEach(c => {
    porCroupier[c] = { minutosMesa: {}, minutosAyudante: 0, minutosDescanso: 0, total: 0 };
  });

  sorted.forEach((hora, idx) => {
    const dur = idx < sorted.length - 1
      ? toMin(sorted[idx + 1]) - toMin(hora)
      : 30;
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

  // Convertir a filas
  const rows = [];
  croupiersEnTabla.forEach(c => {
    const d = porCroupier[c];
    if (d.total === 0) return;

    const mesasEntries = Object.entries(d.minutosMesa);
    const mesaPrincipal = mesasEntries.length
      ? mesasEntries.sort((a, b) => b[1] - a[1])[0][0]
      : '';
    const minMesaPrincipal = mesaPrincipal ? d.minutosMesa[mesaPrincipal] : 0;
    const totalMesa = mesasEntries.reduce((s, [, v]) => s + v, 0);
    const pctMesa = d.total > 0 ? Math.round(totalMesa / d.total * 100) : 0;
    const pctDesc = d.total > 0 ? Math.round(d.minutosDescanso / d.total * 100) : 0;

    rows.push([
      fecha,
      c,
      mesasPorCroupier(d.minutosMesa),  // todas las mesas con minutos
      minMesaPrincipal,
      d.minutosAyudante,
      d.minutosDescanso,
      d.total,
      mesaPrincipal,
      pctMesa,
      pctDesc
    ]);
  });

  return rows;
}

// Devuelve string "M1:45m, M2:30m" para mostrar en celda
function mesasPorCroupier(minutosMesa) {
  return Object.entries(minutosMesa)
    .sort((a, b) => b[1] - a[1])
    .map(([mesa, min]) => mesa + ':' + min + 'm')
    .join(', ');
}

// Ordena horarios como lo hace el frontend
function sortHorariosGAS(a, b) {
  const parts = (h) => { const p = h.split(':'); let hr = parseInt(p[0], 10); if (hr < 6) hr += 24; return hr * 60 + parseInt(p[1], 10); };
  return parts(a) - parts(b);
}

// Helper respuesta JSON con CORS
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
