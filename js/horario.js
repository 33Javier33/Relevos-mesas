/* Lógica principal del Horario de Relevos (index.html) */
/* Depende de: js/shared.js (showModal, sortHorarios, crearTarjetaRelevo, getLocalDateString, generarAlias) */

document.addEventListener('DOMContentLoaded', () => {
    const URL_DEL_SCRIPT_DE_MAESTROS = 'https://script.google.com/macros/s/AKfycbzjaL7OKe1_doagry1eo0w15vXOJy_-oEtWreLTzj1GoQgxyE8cDI7jTgWm7qqThB7M/exec';
    const URL_DEL_SCRIPT_DE_HORARIOS = 'https://script.google.com/macros/s/AKfycbw1kBHYt37_X5K7UdBZlJNTgNT2B2P0t4F6uVrCKK_hDgZ7j09cwSzNx5l9CvHwFCTDQg/exec';

    let croupiersData = [], croupiersEnEspera = [], horarios = [], mesasDeJuego = [], mesasHabilitadas = [], datosRelevos = {}, croupierColors = {}, croupierSalidas = {}, horarioColors = {};
    let fichasData = {};
    const DENOMINACIONES = [1000000, 500000, 200000, 100000, 50000, 20000, 10000, 5000, 1000, 500];
    const fmtFichas = n => n.toLocaleString('es-AR');
    let cronometroIntervals = {}, cronometroStartTime = {}, cronometroCurrentStartTime = {};
    let fechaVisible = new Date(), celdaActiva = { croupier: null, horario: null }, croupierCronoActivo = null, croupierSalidaActivo = null, quickAddCurrentFilter = 'todos';

    let saveTimeout;
    let isSaving = false;
    let solicitudesPrevCount = -1;
    let haySolicitudesNoVistas = false;

    const HELP_TEXTS = {
        general: `<strong>Horario de Relevos — Guía rápida</strong><br><br>
            <b>Tabla:</b> cada fila es un croupier del turno. Arrastrá la fila para reordenar. Hacé clic en cualquier celda de horario para asignar una actividad.<br><br>
            <b>⏰ Salida:</b> registrá la hora de salida de cada croupier. La fila parpadea en rojo cuando se acerca ese momento.<br><br>
            <b>Cronómetro:</b> temporizador individual por croupier para medir tiempo en mesa o descanso.<br><br>
            <b>+:</b> en el encabezado de la tabla, agrega un nuevo horario al turno.<br><br>
            <b>☑ Checkbox:</b> seleccioná varias filas para aplicar un color en bloque.`,
        fecha: `La fecha muestra el día activo del turno.<br><br>
            Hacé clic sobre ella para editarla manualmente.<br><br>
            <strong>No cambia automáticamente</strong> después de medianoche — solo cuando el operador la modifica. Los turnos que empiezan antes de las 06:00 quedan asignados al día anterior.`,
        'color-picker': `Seleccioná un color con el selector y luego hacé clic en <b>🎨</b> para aplicarlo a todas las filas marcadas con el checkbox.<br><br>
            Útil para identificar grupos, contratos o equipos a simple vista.`,
        'quick-add': `Abre el panel para agregar croupiers al turno actual.<br><br>
            Podés filtrar por tipo de contrato:<br>
            • <b>Planta</b> — personal fijo<br>
            • <b>Part Time</b> — jornada parcial<br>
            • <b>Llamado</b> — convocado por turno<br><br>
            También podés buscar por nombre.`,
        'mesas-turno': `Definí qué mesas están abiertas en este turno.<br><br>
            Solo las mesas marcadas aparecerán al asignar relevos. Las mesas sin marcar quedan ocultas para simplificar la asignación.<br><br>
            Si no marcás ninguna, <strong>se muestran todas</strong> las mesas (comportamiento por defecto).`,
        stats: `Muestra estadísticas del turno en cuatro pestañas:<br><br>
            • <b>Resumen:</b> tiempo total, mesas y % por croupier<br>
            • <b>Por Mesa:</b> cuánto tiempo estuvo cada mesa ocupada<br>
            • <b>Descansos:</b> tiempo de descanso y % del turno<br>
            • <b>Por Horario:</b> grilla completa de actividades<br><br>
            Solo cuenta croupiers con actividad registrada y respeta la hora de salida.`,
        actividad: `Elegí qué hace el croupier en este horario:<br><br>
            • <b>Relevo (Trabajo):</b> trabaja en una o más mesas<br>
            • <b>Ayudante Pagador:</b> asiste en los pagos sin ocupar mesa propia<br>
            • <b>Descanso:</b> pausa — no se le asigna mesa`,
        'mesas-selector': `Hacé clic en una mesa para moverla entre <em>Disponibles</em> y <em>Seleccionadas</em>.<br><br>
            Las mesas con <strong>borde punteado y nombre en rojo</strong> ya están asignadas a otro croupier en este horario — no pueden seleccionarse para evitar conflictos.`,
        'estado-horario': `Muestra un resumen de dónde está cada croupier <strong>en este mismo horario</strong>.<br><br>
            Útil para coordinar relevos: podés ver quién está en mesa, descansando o libre antes de asignar.`,
        'descanso-manual': `Seleccioná uno o más croupiers para asignarles descanso al guardar esta tarjeta.<br><br>
            El tiempo entre corchetes indica cuántos minutos llevan <strong>continuamente en la misma mesa</strong>. Los que llevan más tiempo son los candidatos naturales al siguiente descanso.<br><br>
            Ejemplo: <em>Carlos [en RA25 · 1h30m]</em> lleva 90 minutos sin descanso en RA25.`,
    };
    let syncInterval;

    const DOM = {
        tbody: document.getElementById('sortable-tbody'),
        thead: document.getElementById('tabla-horario').querySelector('thead tr'),
        relojDigital: document.getElementById('reloj-digital'),
        fechaDisplay: document.getElementById('fecha-actual'),
        colorPicker: document.getElementById('color-picker'),
        btnAplicarColor: document.getElementById('btn-aplicar-color'),
        croupierTooltip: document.getElementById('croupier-tooltip'),
        relevoModal: document.getElementById('relevo-modal'),
        agregarHorarioModal: document.getElementById('agregar-horario-modal'),
        salidaModal: document.getElementById('salida-modal'),
        fechaModal: document.getElementById('fecha-modal'),
        cronoModal: document.getElementById('crono-modal'),
        quickAddModal: document.getElementById('quick-add-modal'),
        modalTitle: document.getElementById('modal-title'),
        croupierInfo: document.getElementById('croupier-info'),
        horarioInfo: document.getElementById('horario-info'),
        opcionRelevo: document.getElementById('opcion-relevo'),
        opcionAyudante: document.getElementById('opcion-ayudante'),
        opcionDescanso: document.getElementById('opcion-descanso'),
        relevoControlsContainer: document.getElementById('relevo-controls-container'),
        colorRelevoInput: document.getElementById('color-relevo'),
        selectCroupierDescanso: document.getElementById('select-croupier-descanso'),
        inputNuevoHorario: document.getElementById('input-nuevo-horario'),
        salidaModalTitle: document.getElementById('salida-modal-title').querySelector('span'),
        inputSalidaTime: document.getElementById('input-salida-time'),
        inputNuevaFecha: document.getElementById('input-nueva-fecha'),
        cronoModalTitle: document.getElementById('crono-modal-title').querySelector('span'),
        cronoModalTimer: document.getElementById('crono-modal-timer'),
        cronoManualInput: document.getElementById('crono-manual-input'),
        quickAddSelector: document.getElementById('quick-add-selector'),
        quickAddSearchInput: document.getElementById('quick-add-search-input'),
        quickAddCroupierList: document.getElementById('quick-add-croupier-list'),
        quickAddFilterButtons: document.querySelector('#quick-add-modal .quick-add-controls'),
        btnAddSelectedToTable: document.getElementById('btn-add-selected-to-table'),
        linkToViewer: document.getElementById('link-to-viewer'),
        sincroStatus: document.getElementById('sincro-status')
    };

    async function cargarDatosMaestros() {
        try {
            const [croupiersResponse, mesasResponse] = await Promise.all([
                fetch(`${URL_DEL_SCRIPT_DE_MAESTROS}?t=${new Date().getTime()}`),
                fetch(`${URL_DEL_SCRIPT_DE_MAESTROS}?dataType=mesas&t=${new Date().getTime()}`)
            ]);
            if (!croupiersResponse.ok || !mesasResponse.ok) throw new Error('Network response was not ok.');
            const croupiersJson = await croupiersResponse.json();
            const mesasJson = await mesasResponse.json();
            croupiersEnEspera = croupiersJson || [];
            mesasDeJuego = mesasJson || [];
            localStorage.setItem('croupiersEnEspera', JSON.stringify(croupiersEnEspera));
            localStorage.setItem('mesasDeJuego', JSON.stringify(mesasDeJuego));
            console.log("Master data fetched from network and backup saved.");
        } catch (error) {
            console.error("Could not fetch from network, attempting to load from backup.", error);
            croupiersEnEspera = JSON.parse(localStorage.getItem('croupiersEnEspera')) || [];
            mesasDeJuego = JSON.parse(localStorage.getItem('mesasDeJuego')) || [];
            if (croupiersEnEspera.length > 0 || mesasDeJuego.length > 0) {
                showModal('Advertencia', 'No se pudo conectar a la red. Se está usando la última lista guardada de croupiers y mesas.');
            } else {
                showModal('ERROR CRÍTICO', 'No se pudo cargar la base de datos. Revisa la conexión a internet y los permisos del script de base de datos.');
                DOM.quickAddSelector.textContent = 'ERROR DE CONEXIÓN';
                DOM.quickAddSelector.disabled = true;
            }
        }
    }

    function actualizarFechaDisplay() {
        DOM.fechaDisplay.textContent = fechaVisible.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function sincronizarConSheets() {
        clearTimeout(saveTimeout);
        DOM.sincroStatus.textContent = 'Guardando cambios en Sheets...';
        saveTimeout = setTimeout(() => {
            saveTimeout = null;
            isSaving = true;
            const datosAEnviar = {
                action: 'save',
                fecha: getLocalDateString(fechaVisible),
                horarios, datosRelevos,
                croupiersEnTabla: croupiersData.map(c => c.nombreCompleto),
                croupierColors, horarioColors,
                horasSalida: croupierSalidas,
                cronometros: cronometroStartTime,
                mesasHabilitadas
            };
            fetch(URL_DEL_SCRIPT_DE_HORARIOS, {
                method: 'POST',
                body: JSON.stringify(datosAEnviar),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            })
            .then(res => res.json().catch(() => ({})))
            .then(data => {
                console.log('Sincronización de guardado completa:', data.message || 'OK');
                DOM.sincroStatus.textContent = 'Sincronización automática activa.';
                isSaving = false;
            })
            .catch(err => {
                console.error("Error en la sincronización de guardado:", err);
                DOM.sincroStatus.textContent = 'ERROR de sincronización. Revisa la conexión.';
                isSaving = false;
            });
        }, 1500);
    }

    function guardarDatosEnLocalStorage(skipSheetsSync = false) {
        const dataToStore = {
            croupiersEnTabla: croupiersData.map(c => c.nombreCompleto),
            horarios, datosRelevos, croupierColors, croupierSalidas, horarioColors,
            cronometroState: cronometroStartTime,
            mesasHabilitadas,
        };
        localStorage.setItem(`horario_${getLocalDateString(fechaVisible)}`, JSON.stringify(dataToStore));
        if (!skipSheetsSync) sincronizarConSheets();
    }

    function cargarHorarioDesdeLocalStorage() {
        const dataGuardada = localStorage.getItem(`horario_${getLocalDateString(fechaVisible)}`);
        if (!dataGuardada) return false;
        const datos = JSON.parse(dataGuardada);
        const localCroupiersNombres = datos.croupiersEnTabla || [];
        croupiersData = localCroupiersNombres.map(nombre => croupiersEnEspera.find(ce => ce.nombreCompleto === nombre)).filter(Boolean);
        datosRelevos = datos.datosRelevos || {};
        croupierColors = datos.croupierColors || {};
        croupierSalidas = datos.croupierSalidas || {};
        horarioColors = datos.horarioColors || {};
        horarios = datos.horarios || [];
        cronometroStartTime = datos.cronometroState || {};
        mesasHabilitadas = datos.mesasHabilitadas || [];
        return true;
    }

    async function sincronizarDesdeSheets(forceRender = true) {
        const fechaISO = getLocalDateString(fechaVisible);
        try {
            if ((saveTimeout || isSaving) && !forceRender) return;
            const response = await fetch(`${URL_DEL_SCRIPT_DE_HORARIOS}?action=load&fecha=${fechaISO}&t=${new Date().getTime()}`);
            const data = await response.json();
            if (data.found) {
                const currentDataString = JSON.stringify({ horarios, datosRelevos, croupierColors, horarioColors, croupierSalidas, cronometroStartTime });
                const newDataString = JSON.stringify({
                    horarios: data.horarios || [],
                    datosRelevos: data.datosRelevos || {},
                    croupierColors: data.croupierColors || {},
                    horarioColors: data.horarioColors || {},
                    croupierSalidas: data.horasSalida || {},
                    cronometroStartTime: data.cronometros || {},
                });
                if (forceRender || currentDataString !== newDataString) {
                    if (!forceRender) {
                        console.log('Sincronización automática: Nuevos datos detectados en Sheets. Actualizando estado...');
                        DOM.sincroStatus.textContent = 'Actualizando desde Sheets...';
                        setTimeout(() => { DOM.sincroStatus.textContent = 'Sincronización automática activa.'; }, 1000);
                    }
                    const croupiersNombres = data.croupiersEnTabla || [];
                    croupiersData = croupiersNombres.map(nombre => croupiersEnEspera.find(ce => ce.nombreCompleto === nombre)).filter(Boolean);
                    horarios = data.horarios || [];
                    datosRelevos = data.datosRelevos || {};
                    croupierColors = data.croupierColors || {};
                    horarioColors = data.horarioColors || {};
                    croupierSalidas = data.horasSalida || {};
                    cronometroStartTime = data.cronometros || {};
                    guardarDatosEnLocalStorage(true);
                    renderizarHorario();
                    reiniciarCronometrosActivos();
                }
                return true;
            }
        } catch (error) {
            console.error("Error al sincronizar desde Sheets:", error);
            if (forceRender) {
                showModal('Error', 'No se pudo conectar para cargar los datos. Se usará la última versión guardada localmente.', 'error');
            }
        }
        return false;
    }

    function iniciarSincronizacionAutomatica() {
        syncInterval = setInterval(async () => {
            await sincronizarDesdeSheets(false);
        }, 8000);
    }

    async function cambiarFecha(nuevaFecha) {
        fechaVisible = nuevaFecha;
        solicitudesPrevCount = -1;
        actualizarFechaDisplay();
        if (!cargarHorarioDesdeLocalStorage()) {
            await sincronizarDesdeSheets(true);
        }
        renderizarHorario();
        reiniciarCronometrosActivos();
        actualizarBotonMesasTurno();
        cargarNotificacionesSolicitudes();
    }

    async function guardarNuevaFecha() {
        const nuevaFechaStr = DOM.inputNuevaFecha.value;
        if (nuevaFechaStr) {
            await cambiarFecha(new Date(nuevaFechaStr + 'T00:00:00'));
            sessionStorage.setItem('horarioFecha', getLocalDateString(fechaVisible));
        }
        cerrarModales();
    }

    function actualizarSistema() {
        const now = new Date();
        DOM.relojDigital.textContent = now.toTimeString().slice(0, 8);
        let isAnyWarning = false;
        const sortedHorarios = [...horarios].sort(sortHorarios);
        const horariosDate = sortedHorarios.map(h => {
            const [hour, minute] = h.split(':');
            const date = new Date(fechaVisible);
            date.setHours(hour, minute, 0, 0);
            if (parseInt(hour, 10) < 6) date.setDate(date.getDate() + 1);
            return date;
        });

        croupiersData.forEach(croupierObj => {
            if (!croupierObj) return;
            const croupier = croupierObj.nombreCompleto;
            const isTimerRunning = cronometroIntervals.hasOwnProperty(croupier);
            const isManualTimerSet = cronometroStartTime.hasOwnProperty(croupier);

            if (!isManualTimerSet) {
                let lastActionTime = null;
                let lastActionIsWork = false;
                for (let i = horariosDate.length - 1; i >= 0; i--) {
                    if (now >= horariosDate[i]) {
                        const activity = datosRelevos[croupier]?.[sortedHorarios[i]];
                        if (activity && !activity.autoDisplaced) {
                            lastActionTime = horariosDate[i].getTime();
                            lastActionIsWork = activity.actividad === 'releva' || activity.actividad === 'ayudante-pagador';
                            break;
                        }
                    }
                }
                if (lastActionIsWork && !isTimerRunning) {
                    iniciarCronometro(croupier, lastActionTime, false);
                } else if (!lastActionIsWork && isTimerRunning) {
                    detenerCronometro(croupier, true, false);
                }
            }

            const salidaTime = croupierSalidas[croupier];
            const rowElement = document.querySelector(`tr[data-croupier="${croupier}"]`);
            let shouldWarn = false;
            if (salidaTime) {
                const [h, m] = salidaTime.split(':').map(Number);
                const salidaDate = new Date(fechaVisible);
                salidaDate.setHours(h, m, 0, 0);
                if (h < 6) salidaDate.setDate(salidaDate.getDate() + 1);
                const diffMinutes = (salidaDate.getTime() - now.getTime()) / 60000;
                shouldWarn = diffMinutes > 0 && diffMinutes <= 20;
            }
            if (rowElement) rowElement.classList.toggle('salida-warning', shouldWarn);
            if (shouldWarn) isAnyWarning = true;
        });
        DOM.relojDigital.classList.toggle('warning-pulse', isAnyWarning);
    }

    function iniciarCronometro(croupier, startTime, esManual = true) {
        if (!startTime) return;
        if (cronometroIntervals[croupier]) clearInterval(cronometroIntervals[croupier]);
        cronometroCurrentStartTime[croupier] = startTime;
        if (esManual) cronometroStartTime[croupier] = startTime;
        const update = () => {
            const elapsed = new Date().getTime() - cronometroCurrentStartTime[croupier];
            if (elapsed >= 0) actualizarDisplayCrono(croupier, new Date(elapsed).toISOString().slice(11, 19));
        };
        cronometroIntervals[croupier] = setInterval(update, 1000);
        update();
        const display = document.querySelector(`[data-croupier-crono="${croupier}"] .cronometro-display`);
        if (display) display.classList.add('running');
        if (esManual) guardarDatosEnLocalStorage();
    }

    function detenerCronometro(croupier, reset = false, esManual = true) {
        if (cronometroIntervals[croupier]) {
            clearInterval(cronometroIntervals[croupier]);
            delete cronometroIntervals[croupier];
        }
        delete cronometroCurrentStartTime[croupier];
        if (esManual) delete cronometroStartTime[croupier];
        if (reset) actualizarDisplayCrono(croupier, '00:00:00');
        const display = document.querySelector(`[data-croupier-crono="${croupier}"] .cronometro-display`);
        if (display) display.classList.remove('running');
        if (esManual) guardarDatosEnLocalStorage();
    }

    function guardarRelevo() {
        const { croupier, horario } = celdaActiva;
        const actividad = document.querySelector('input[name="actividad"]:checked').value;
        if (!datosRelevos[croupier]) datosRelevos[croupier] = {};
        if (actividad === 'releva') {
            const mesas = Array.from(document.getElementById('mesas-seleccionadas').children).map(item => item.dataset.mesa);
            if (mesas.length > 0) {
                datosRelevos[croupier][horario] = { actividad: 'releva', mesas, color: DOM.colorRelevoInput.value };
            } else {
                delete datosRelevos[croupier][horario];
            }
        } else {
            datosRelevos[croupier][horario] = { actividad };
        }
        const descansoSelected = Array.from(DOM.selectCroupierDescanso.selectedOptions).map(opt => opt.value);
        descansoSelected.forEach(cd => {
            if (!datosRelevos[cd]) datosRelevos[cd] = {};
            datosRelevos[cd][horario] = { actividad: 'descanso' };
        });

        // Auto-registrar al croupier desplazado moviéndose a la mesa vacada.
        // La tarjeta se marca autoDisplaced:true → se muestra apagada (solo informativa).
        if (actividad === 'releva' && descansoSelected.length > 0) {
            const sortedH = [...horarios].sort(sortHorarios);
            const ci = sortedH.indexOf(horario);
            if (ci > 0) {
                const mesasAsignadas = datosRelevos[croupier]?.[horario]?.mesas || [];
                function findLastHolder(mesa) {
                    for (let i = ci - 1; i >= 0; i--) {
                        for (const [n, slots] of Object.entries(datosRelevos)) {
                            if (n === croupier) continue;
                            const rel = slots[sortedH[i]];
                            if (rel?.actividad === 'releva' && rel.mesas?.includes(mesa)) {
                                return { nombre: n, color: rel.color };
                            }
                        }
                    }
                    return null;
                }
                const displaced = new Map();
                const vacatedMesas = [];
                for (const mesa of mesasAsignadas) {
                    const holder = findLastHolder(mesa);
                    if (!holder) continue;
                    if (descansoSelected.includes(holder.nombre)) {
                        vacatedMesas.push(mesa);
                    } else if (!displaced.has(holder.nombre)) {
                        displaced.set(holder.nombre, holder.color);
                    }
                }
                if (displaced.size > 0 && vacatedMesas.length > 0) {
                    const displacedArr = [...displaced.entries()];
                    if (displacedArr.length === 1) {
                        const [nombre, color] = displacedArr[0];
                        if (!datosRelevos[nombre]?.[horario]) {
                            if (!datosRelevos[nombre]) datosRelevos[nombre] = {};
                            datosRelevos[nombre][horario] = { actividad: 'releva', mesas: vacatedMesas, color, autoDisplaced: true };
                        }
                    } else {
                        displacedArr.forEach(([nombre, color], idx) => {
                            if (idx >= vacatedMesas.length || datosRelevos[nombre]?.[horario]) return;
                            if (!datosRelevos[nombre]) datosRelevos[nombre] = {};
                            datosRelevos[nombre][horario] = { actividad: 'releva', mesas: [vacatedMesas[idx]], color, autoDisplaced: true };
                        });
                    }
                }
            }
        }

        guardarDatosEnLocalStorage();
        renderizarHorario();
        actualizarSistema();
        cerrarModales();
    }

    function borrarRelevo() {
        const { croupier, horario } = celdaActiva;
        if (datosRelevos[croupier]?.[horario]) {
            delete datosRelevos[croupier][horario];
        }
        guardarDatosEnLocalStorage();
        renderizarHorario();
        actualizarSistema();
        cerrarModales();
    }

    function openCronoModal(croupier) {
        croupierCronoActivo = croupier;
        DOM.cronoModalTitle.textContent = generarAlias(croupier);
        const startTime = cronometroCurrentStartTime[croupier];
        const isRunning = !!startTime;
        document.getElementById('crono-btn-start').disabled = isRunning;
        document.getElementById('crono-btn-stop').disabled = !isRunning;
        DOM.cronoModalTimer.parentElement.classList.toggle('running', isRunning);
        const elapsed = isRunning ? new Date().getTime() - startTime : 0;
        DOM.cronoManualInput.value = elapsed > 0 ? Math.floor(elapsed / 60000) : '';
        actualizarDisplayCrono(croupier, new Date(elapsed).toISOString().slice(11, 19));
        DOM.cronoModal.style.display = 'flex';
    }

    function abrirAgregarHorarioModal() { DOM.agregarHorarioModal.style.display = 'flex'; }

    function guardarNuevoHorario() {
        const nuevaHora = DOM.inputNuevoHorario.value;
        if (nuevaHora && !horarios.includes(nuevaHora)) {
            horarios.push(nuevaHora);
            guardarDatosEnLocalStorage();
            renderizarHorario();
        }
        cerrarModales();
    }

    function abrirSalidaModal(croupier) {
        croupierSalidaActivo = croupier;
        DOM.salidaModalTitle.textContent = generarAlias(croupier);
        DOM.inputSalidaTime.value = croupierSalidas[croupier] || '';
        DOM.salidaModal.style.display = 'flex';
    }

    function guardarSalida() {
        croupierSalidas[croupierSalidaActivo] = DOM.inputSalidaTime.value;
        guardarDatosEnLocalStorage();
        renderizarHorario();
        cerrarModales();
    }

    function borrarSalida() {
        delete croupierSalidas[croupierSalidaActivo];
        guardarDatosEnLocalStorage();
        renderizarHorario();
        cerrarModales();
    }

    function abrirFechaModal() {
        DOM.inputNuevaFecha.value = getLocalDateString(fechaVisible);
        DOM.fechaModal.style.display = 'flex';
    }

    async function inicializar() {
        const role = localStorage.getItem('userRole');
        if (!role || role !== 'operador') {
            window.location.href = 'login.html';
            return;
        }
        await cargarDatosMaestros();
        const params = new URLSearchParams(window.location.search);
        const fechaURL = params.get('fecha');
        const sessionFecha = sessionStorage.getItem('horarioFecha');

        function getInitialDate() {
            if (fechaURL) return new Date(fechaURL + 'T00:00:00');
            if (sessionFecha) return new Date(sessionFecha + 'T00:00:00');
            const now = new Date();
            if (now.getHours() < 6) {
                const ayer = new Date(now);
                ayer.setDate(ayer.getDate() - 1);
                return ayer;
            }
            return now;
        }
        const initialDate = getInitialDate();
        if (!sessionFecha && !fechaURL) sessionStorage.setItem('horarioFecha', getLocalDateString(initialDate));
        await cambiarFecha(initialDate);
        setupEventListeners();
        setupHelpPopovers();
        setInterval(actualizarSistema, 1000);
        iniciarSincronizacionAutomatica();
        cargarNotificacionesSolicitudes();
        setInterval(cargarNotificacionesSolicitudes, 5000);
        initMirrorScroll();

        new Sortable(DOM.tbody, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            multiDrag: true,
            selectedClass: 'row-selected',
            filter: '.croupier-row:not(.row-selected)',
            preventOnFilter: false,
            onEnd: () => {
                const newOrderNames = Array.from(DOM.tbody.children).map(tr => tr.dataset.croupier);
                croupiersData.sort((a, b) => newOrderNames.indexOf(a.nombreCompleto) - newOrderNames.indexOf(b.nombreCompleto));
                guardarDatosEnLocalStorage();
            }
        });

        window.addEventListener('storage', (event) => {
            if (event.key === 'croupiersEnEspera' || event.key === 'mesasDeJuego') {
                console.log('Database change detected, reloading master data...');
                cargarDatosMaestros().then(() => {
                    const croupierNamesInTable = croupiersData.map(c => c.nombreCompleto);
                    croupiersData = croupierNamesInTable
                        .map(nombre => croupiersEnEspera.find(ce => ce.nombreCompleto === nombre))
                        .filter(Boolean);
                    renderizarHorario();
                });
            }
        });
    }

    function reiniciarCronometrosActivos() {
        Object.values(cronometroIntervals).forEach(clearInterval);
        cronometroIntervals = {};
        cronometroCurrentStartTime = {};
        for (const [croupier, time] of Object.entries(cronometroStartTime)) {
            iniciarCronometro(croupier, time, true);
        }
    }

    function renderizarHorario() { renderizarCabecera(); renderizarCuerpo(); renderQuickAddSelector(); actualizarMirrorScroll(); }

    function actualizarMirrorScroll() {
        const tabla   = document.querySelector('.horario-tabla');
        const track   = document.getElementById('mirror-scroll-track');
        const inner   = document.getElementById('mirror-scroll-inner');
        if (!tabla || !track || !inner) return;
        inner.style.width = tabla.scrollWidth + 'px';
    }

    function initMirrorScroll() {
        const tabla = document.querySelector('.horario-tabla');
        const track = document.getElementById('mirror-scroll-track');
        if (!tabla || !track) return;
        let ignoreTabla = false, ignoreTrack = false;
        tabla.addEventListener('scroll', () => {
            if (ignoreTabla) return;
            ignoreTrack = true;
            track.scrollLeft = tabla.scrollLeft;
            ignoreTrack = false;
        });
        track.addEventListener('scroll', () => {
            if (ignoreTrack) return;
            ignoreTabla = true;
            tabla.scrollLeft = track.scrollLeft;
            ignoreTabla = false;
        });
        actualizarMirrorScroll();
    }

    function renderizarCabecera() {
        DOM.thead.innerHTML = '';
        const thCroupier = document.createElement('th');
        thCroupier.className = 'croupier-header';
        thCroupier.innerHTML = `<input type="checkbox" id="select-all-croupiers"> Nombre <span class="contador-badge">${croupiersData.length}</span>`;
        DOM.thead.appendChild(thCroupier);
        const thCrono = document.createElement('th');
        thCrono.className = 'crono-header';
        thCrono.textContent = 'Crono.';
        DOM.thead.appendChild(thCrono);
        horarios.sort(sortHorarios).forEach(hora => {
            const th = document.createElement('th');
            th.dataset.horario = hora;
            const contentDiv = document.createElement('div');
            contentDiv.className = 'horario-header-content';
            const editSpan = document.createElement('span');
            editSpan.textContent = hora;
            editSpan.addEventListener('click', () => editarHorario(hora, th));
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-time';
            deleteBtn.textContent = '×';
            deleteBtn.addEventListener('click', e => { e.stopPropagation(); borrarHorario(hora); });
            contentDiv.appendChild(editSpan);
            contentDiv.appendChild(deleteBtn);
            th.appendChild(contentDiv);
            if (horarioColors[hora]) th.style.backgroundColor = horarioColors[hora];
            DOM.thead.appendChild(th);
        });
        const thAgregar = document.createElement('th');
        thAgregar.className = 'agregar-horario-th';
        thAgregar.innerHTML = '<span>+</span>';
        DOM.thead.appendChild(thAgregar);
        DOM.thead.querySelector('#select-all-croupiers')?.addEventListener('change', seleccionarTodosCroupiers);
        DOM.thead.querySelector('.agregar-horario-th')?.addEventListener('click', abrirAgregarHorarioModal);
    }

    function renderizarCuerpo() {
        DOM.tbody.innerHTML = '';
        croupiersData.forEach(croupierObj => {
            if (!croupierObj) return;
            const tr = document.createElement('tr');
            tr.className = 'croupier-row';
            tr.dataset.croupier = croupierObj.nombreCompleto;
            const tdNombre = document.createElement('td');
            const croupierColor = croupierColors[croupierObj.nombreCompleto];
            if (croupierColor) tdNombre.style.backgroundColor = croupierColor;
            tdNombre.innerHTML = `<div class="croupier-cell-content"><button class="delete-croupier">×</button><div><input type="checkbox" class="croupier-checkbox"><span class="croupier-name">${generarAlias(croupierObj.nombreCompleto)}</span></div><div class="salida-card" data-croupier-salida="${croupierObj.nombreCompleto}"><span>⏰</span><span class="salida-time">${croupierSalidas[croupierObj.nombreCompleto] || '--:--'}</span></div></div>`;
            tr.appendChild(tdNombre);
            const tdCrono = document.createElement('td');
            tdCrono.className = 'cronometro-cell';
            tdCrono.dataset.croupierCrono = croupierObj.nombreCompleto;
            tdCrono.innerHTML = `<div class="cronometro-display"><span class="timer">00:00:00</span></div>`;
            if (cronometroStartTime[croupierObj.nombreCompleto] || cronometroIntervals[croupierObj.nombreCompleto]) {
                tdCrono.querySelector('.cronometro-display').classList.add('running');
            }
            tr.appendChild(tdCrono);
            horarios.forEach(hora => {
                const td = document.createElement('td');
                td.dataset.croupier = croupierObj.nombreCompleto;
                td.dataset.horario = hora;
                const relevoData = datosRelevos[croupierObj.nombreCompleto]?.[hora];
                if (relevoData) {
                    const card = crearTarjetaRelevo(relevoData);
                    if (relevoData.autoDisplaced) card.classList.add('relevo-desplazado');
                    td.appendChild(card);
                }
                tr.appendChild(td);
            });
            DOM.tbody.appendChild(tr);
        });
        DOM.tbody.querySelectorAll('.croupier-row').forEach(tr => {
            const nombre = tr.dataset.croupier;
            tr.querySelector('.delete-croupier').addEventListener('click', e => { e.stopPropagation(); borrarCroupier(nombre); });
            tr.querySelector('.salida-card').addEventListener('click', e => { e.stopPropagation(); abrirSalidaModal(nombre); });
            tr.querySelector('.cronometro-cell').addEventListener('click', e => { e.stopPropagation(); openCronoModal(nombre); });
            tr.querySelector('.croupier-checkbox').addEventListener('change', e => tr.classList.toggle('row-selected', e.target.checked));
            tr.querySelector('.croupier-name').addEventListener('mouseenter', e => mostrarTooltip(nombre, e.target));
            tr.querySelector('.croupier-name').addEventListener('mouseleave', ocultarTooltip);
            tr.querySelectorAll('td[data-horario]').forEach(td => {
                td.addEventListener('click', () => abrirRelevoModal(nombre, td.dataset.horario));
            });
        });
    }

    function renderQuickAddSelector() {
        const available = croupiersEnEspera.filter(c => !croupiersData.some(cd => cd.nombreCompleto === c.nombreCompleto));
        DOM.quickAddSelector.textContent = available.length > 0 ? `Agregar Croupier... (${available.length} disp.)` : 'No hay Croupiers para agregar';
        DOM.quickAddSelector.disabled = available.length === 0;
    }

    function seleccionarTodosCroupiers(event) {
        const isChecked = event.target.checked;
        document.querySelectorAll('.croupier-checkbox').forEach(cb => {
            cb.checked = isChecked;
            cb.closest('.croupier-row').classList.toggle('row-selected', isChecked);
        });
    }

    function borrarCroupier(nombre) {
        showModal('Confirmar', `¿Eliminar a ${nombre} de la tabla?`, 'confirm', () => {
            croupiersData = croupiersData.filter(c => c.nombreCompleto !== nombre);
            delete datosRelevos[nombre];
            delete croupierColors[nombre];
            delete croupierSalidas[nombre];
            detenerCronometro(nombre, true, true);
            guardarDatosEnLocalStorage();
            renderizarHorario();
        });
    }

    function borrarHorario(hora) {
        showModal('Confirmar', `¿Eliminar el horario ${hora} y todas sus asignaciones?`, 'confirm', () => {
            horarios = horarios.filter(h => h !== hora);
            Object.keys(datosRelevos).forEach(croupier => {
                if (datosRelevos[croupier] && typeof datosRelevos[croupier] === 'object') {
                    delete datosRelevos[croupier][hora];
                }
            });
            delete horarioColors[hora];
            guardarDatosEnLocalStorage();
            renderizarHorario();
        });
    }

    function limpiarCroupiers() {
        showModal('Confirmar Acción', '¿Está seguro de que desea eliminar a TODOS los croupiers de la tabla? Esta acción no se puede deshacer.', 'confirm', () => {
            Object.keys(cronometroIntervals).forEach(croupier => { detenerCronometro(croupier, true, false); });
            croupiersData = []; datosRelevos = {}; croupierColors = {};
            croupierSalidas = {}; cronometroStartTime = {};
            cronometroCurrentStartTime = {}; cronometroIntervals = {};
            guardarDatosEnLocalStorage();
            renderizarHorario();
        });
    }

    function limpiarHorarios() {
        showModal('Confirmar Acción', '¿Está seguro de que desea eliminar TODOS los horarios? Se perderán todas las asignaciones. Esta acción no se puede deshacer.', 'confirm', () => {
            horarios = [];
            horarioColors = {};
            Object.keys(datosRelevos).forEach(croupier => { datosRelevos[croupier] = {}; });
            guardarDatosEnLocalStorage();
            renderizarHorario();
        });
    }

    function aplicarColor() {
        const color = DOM.colorPicker.value;
        const seleccionados = document.querySelectorAll('.croupier-checkbox:checked');
        if (seleccionados.length === 0) { showModal('Info', 'Selecciona al menos un croupier.'); return; }
        seleccionados.forEach(cb => {
            const nombre = cb.closest('.croupier-row').dataset.croupier;
            croupierColors[nombre] = color;
        });
        guardarDatosEnLocalStorage();
        renderizarHorario();
    }

    function editarHorario(oldTime, thElement) {
        const contentDiv = thElement.querySelector('.horario-header-content');
        const originalHTML = contentDiv.innerHTML;
        contentDiv.innerHTML = `<input type="time" value="${oldTime}" style="width: 80px;">`;
        const input = contentDiv.querySelector('input');
        input.focus();
        const save = () => {
            const newTime = input.value;
            if (newTime && newTime !== oldTime && !horarios.includes(newTime)) {
                const oldIndex = horarios.indexOf(oldTime);
                horarios[oldIndex] = newTime;
                Object.values(datosRelevos).forEach(cRelevos => {
                    if (cRelevos[oldTime]) { cRelevos[newTime] = cRelevos[oldTime]; delete cRelevos[oldTime]; }
                });
                if (horarioColors[oldTime]) { horarioColors[newTime] = horarioColors[oldTime]; delete horarioColors[oldTime]; }
                guardarDatosEnLocalStorage();
                renderizarHorario();
            } else {
                contentDiv.innerHTML = originalHTML;
            }
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') contentDiv.innerHTML = originalHTML;
        });
    }

    function abrirRelevoModal(croupier, horario) {
        celdaActiva = { croupier, horario };
        DOM.modalTitle.textContent = `Asignar actividad para ${generarAlias(croupier)}`;
        DOM.croupierInfo.textContent = generarAlias(croupier);
        DOM.horarioInfo.textContent = horario;
        const relevoExistente = datosRelevos[croupier]?.[horario];
        const actividadExistente = relevoExistente?.actividad || 'releva';
        document.querySelector(`input[name="actividad"][value="${actividadExistente}"]`).checked = true;
        toggleRelevoControls(actividadExistente);
        const mesasRelevo = relevoExistente?.actividad === 'releva' ? relevoExistente.mesas : [];
        const mesasDisponiblesDiv = document.getElementById('mesas-disponibles');
        const mesasSeleccionadasDiv = document.getElementById('mesas-seleccionadas');
        mesasDisponiblesDiv.innerHTML = '';
        mesasSeleccionadasDiv.innerHTML = '';

        // Mesas ya asignadas a OTROS croupiers en este mismo horario
        const mesasOcupadas = {};
        croupiersData.forEach(c => {
            if (c.nombreCompleto === croupier) return;
            const rel = datosRelevos[c.nombreCompleto]?.[horario];
            if (rel?.actividad === 'releva' && rel.mesas?.length) {
                rel.mesas.forEach(m => { mesasOcupadas[m] = generarAlias(c.nombreCompleto); });
            }
        });

        // Mostrar solo mesas habilitadas del turno (o todas si no hay selección)
        const mesasVisibles = mesasHabilitadas.length > 0
            ? mesasDeJuego.filter(m => mesasHabilitadas.includes(m))
            : mesasDeJuego;

        mesasVisibles.forEach(mesa => {
            if (mesasRelevo.includes(mesa)) {
                mesasSeleccionadasDiv.innerHTML += `<div class="mesa-item" data-mesa="${mesa}">${mesa}</div>`;
            } else if (mesasOcupadas[mesa]) {
                mesasDisponiblesDiv.innerHTML += `<div class="mesa-item mesa-ocupada" data-mesa="${mesa}" title="Ya asignada a ${mesasOcupadas[mesa]}">${mesa}<span class="ocupada-label">↳${mesasOcupadas[mesa]}</span></div>`;
            } else {
                mesasDisponiblesDiv.innerHTML += `<div class="mesa-item" data-mesa="${mesa}">${mesa}</div>`;
            }
        });

        DOM.colorRelevoInput.value = relevoExistente?.color || '#3498db';
        renderEstadoHorarioPanel(horario, croupier);
        llenarSelectorDescansoManual();
        DOM.relevoModal.style.display = 'flex';
    }

    function toggleRelevoControls(actividad) {
        DOM.relevoControlsContainer.style.display = actividad === 'releva' ? 'block' : 'none';
    }

    function actualizarBotonMesasTurno() {
        const btn = document.getElementById('btn-mesas-turno');
        if (!btn) return;
        if (mesasHabilitadas.length > 0) {
            btn.textContent = `🎰 ${mesasHabilitadas.length} mesa${mesasHabilitadas.length !== 1 ? 's' : ''} activa${mesasHabilitadas.length !== 1 ? 's' : ''}`;
            btn.style.borderColor = 'var(--primary-color)';
            btn.style.color = 'var(--primary-color)';
        } else {
            btn.textContent = '🎰 Mesas del turno';
            btn.style.borderColor = 'var(--border-color)';
            btn.style.color = 'var(--text-color)';
        }
    }

    function abrirMesasTurnoModal() {
        const grid = document.getElementById('mesas-turno-grid');
        grid.innerHTML = '';
        mesasDeJuego.forEach(mesa => {
            const activa = mesasHabilitadas.includes(mesa);
            const chip = document.createElement('div');
            chip.className = 'mesa-turno-chip' + (activa ? ' activa' : '');
            chip.dataset.mesa = mesa;
            chip.textContent = mesa;
            chip.addEventListener('click', () => chip.classList.toggle('activa'));
            grid.appendChild(chip);
        });
        document.getElementById('mesas-turno-modal').style.display = 'flex';
    }

    function guardarMesasTurno() {
        const chips = document.querySelectorAll('#mesas-turno-grid .mesa-turno-chip.activa');
        mesasHabilitadas = Array.from(chips).map(c => c.dataset.mesa);
        guardarDatosEnLocalStorage();
        actualizarBotonMesasTurno();
        cerrarModales();
    }

    function renderEstadoHorarioPanel(horario, croupierActual) {
        const panel = document.getElementById('estado-horario-panel');
        if (!panel) return;
        const otros = croupiersData.filter(c => c.nombreCompleto !== croupierActual);
        if (!otros.length) { panel.style.display = 'none'; return; }

        const rows = otros.map(c => {
            const rel = datosRelevos[c.nombreCompleto]?.[horario];
            let info = '—';
            let cls = '';
            if (rel?.actividad === 'releva') {
                info = rel.mesas?.join(', ') || '?';
                cls = 'estado-mesa';
            } else if (rel?.actividad === 'descanso') {
                info = 'Descansando';
                cls = 'estado-descanso';
            } else if (rel?.actividad === 'ayudante-pagador') {
                info = 'Ayud. Pagador';
                cls = 'estado-ayudante';
            }
            return `<div class="estado-row"><span class="estado-nombre">${generarAlias(c.nombreCompleto)}</span><span class="estado-valor ${cls}">${info}</span></div>`;
        });

        panel.style.display = 'block';
        panel.innerHTML = `<details><summary>Estado del turno a las <strong>${horario}</strong> <button class="help-btn" data-help="estado-horario">?</button></summary><div class="estado-grid">${rows.join('')}</div></details>`;
    }

    function llenarSelectorDescansoManual() {
        DOM.selectCroupierDescanso.innerHTML = '';
        const sortedHorarios = [...horarios].sort(sortHorarios);
        const currentIndex = sortedHorarios.indexOf(celdaActiva.horario);

        const toMin = (h) => { const [hr, mn] = h.split(':').map(Number); return (hr < 6 ? hr + 24 : hr) * 60 + mn; };
        const fmtMin = (m) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 > 0 ? (m % 60) + 'm' : ''}` : `${m}m`;

        function minutosConsecutivosEnMesa(nombre, fromIndex) {
            if (fromIndex <= 0) return null;
            let refMesas = null;
            let totalMin = 0;
            for (let i = fromIndex - 1; i >= 0; i--) {
                const rel = datosRelevos[nombre]?.[sortedHorarios[i]];
                if (!rel || rel.actividad !== 'releva' || !rel.mesas?.length) break;
                if (rel.autoDisplaced) {
                    totalMin += toMin(sortedHorarios[i + 1]) - toMin(sortedHorarios[i]);
                    continue;
                }
                if (!refMesas) {
                    refMesas = rel.mesas;
                } else if (rel.mesas.length !== refMesas.length || !rel.mesas.every(m => refMesas.includes(m))) {
                    break;
                }
                totalMin += toMin(sortedHorarios[i + 1]) - toMin(sortedHorarios[i]);
            }
            return refMesas && totalMin > 0 ? { minutos: totalMin, mesas: refMesas } : null;
        }

        // Calcula la ubicación efectiva de un croupier sin asignación directa,
        // siguiendo la cadena de desplazamiento: si su última mesa fue tomada por
        // otro croupier que envió a alguien a descanso, el croupier desplazado
        // pasó a la mesa vacada por quien fue a descanso.
        function calcularUbicacionEfectiva(nombre) {
            for (let i = currentIndex - 1; i >= 0; i--) {
                const rel = datosRelevos[nombre]?.[sortedHorarios[i]];
                if (!rel) continue;
                if (rel.actividad !== 'releva' || !rel.mesas?.length) {
                    return { tipo: rel.actividad, slotIdx: i };
                }
                let mesasActuales = rel.mesas;
                let slotActual = i;
                // Buscar si alguien tomó esas mesas en un slot posterior
                for (let j = i + 1; j < currentIndex; j++) {
                    const slot = sortedHorarios[j];
                    for (const [otro, slots] of Object.entries(datosRelevos)) {
                        if (otro === nombre) continue;
                        const otroRel = slots[slot];
                        if (otroRel?.actividad !== 'releva') continue;
                        if (!(otroRel.mesas || []).some(m => mesasActuales.includes(m))) continue;
                        // "otro" tomó alguna de las mesas de "nombre" en slot j.
                        // Buscar mesas vacadas por croupiers que fueron a descanso en ese slot.
                        const vacadas = [];
                        for (const [d, dSlots] of Object.entries(datosRelevos)) {
                            if (d === nombre || d === otro) continue;
                            if (dSlots[slot]?.actividad !== 'descanso') continue;
                            for (let k = j - 1; k >= 0; k--) {
                                const prevD = datosRelevos[d]?.[sortedHorarios[k]];
                                if (!prevD) continue;
                                if (prevD.actividad === 'releva' && prevD.mesas?.length) {
                                    prevD.mesas.forEach(m => {
                                        if ((otroRel.mesas || []).includes(m) && !mesasActuales.includes(m)) {
                                            vacadas.push(m);
                                        }
                                    });
                                }
                                break;
                            }
                        }
                        if (vacadas.length > 0) {
                            mesasActuales = vacadas;
                            slotActual = j;
                        }
                        break;
                    }
                }
                return { tipo: 'releva', mesas: mesasActuales, slotIdx: slotActual };
            }
            return null;
        }

        croupiersData.forEach(c => {
            if (c.nombreCompleto === celdaActiva.croupier) return;
            const nombre = c.nombreCompleto;

            const currentRel = datosRelevos[nombre]?.[celdaActiva.horario];
            let activityInfo = '';

            if (currentRel?.actividad === 'releva' && currentRel.mesas?.length) {
                const prev = minutosConsecutivosEnMesa(nombre, currentIndex);
                const slotDur = currentIndex < sortedHorarios.length - 1
                    ? toMin(sortedHorarios[currentIndex + 1]) - toMin(sortedHorarios[currentIndex])
                    : 30;
                const total = (prev?.minutos || 0) + slotDur;
                activityInfo = ` [en ${currentRel.mesas.join(', ')} · ${fmtMin(total)}]`;
            } else if (currentRel?.actividad === 'descanso') {
                activityInfo = ' [descansando]';
            } else if (currentRel?.actividad === 'ayudante-pagador') {
                activityInfo = ' [ayud. pagador]';
            }

            if (!activityInfo) {
                const ubicacion = calcularUbicacionEfectiva(nombre);
                if (ubicacion?.tipo === 'releva') {
                    const prev = minutosConsecutivosEnMesa(nombre, ubicacion.slotIdx + 1);
                    const tiempo = prev ? ` · ${fmtMin(prev.minutos)}` : '';
                    activityInfo = ` (viene de ${ubicacion.mesas.join(', ')}${tiempo})`;
                } else if (ubicacion?.tipo === 'descanso') {
                    activityInfo = ' (en descanso)';
                } else if (ubicacion?.tipo === 'ayudante-pagador') {
                    activityInfo = ' (ayud. pagador)';
                } else {
                    activityInfo = ' (sin actividad anterior)';
                }
            }

            const option = document.createElement('option');
            option.value = nombre;
            option.textContent = generarAlias(nombre) + activityInfo;
            DOM.selectCroupierDescanso.appendChild(option);
        });
    }

    function ajustarTiempoManualCrono() {
        if (!croupierCronoActivo) return;
        const minutos = parseInt(DOM.cronoManualInput.value, 10);
        if (isNaN(minutos) || minutos < 0) { showModal('Error', 'Introduce un número válido de minutos.'); return; }
        const nuevoStartTime = new Date().getTime() - (minutos * 60 * 1000);
        iniciarCronometro(croupierCronoActivo, nuevoStartTime, true);
        openCronoModal(croupierCronoActivo);
    }

    function actualizarDisplayCrono(croupier, tiempo) {
        const timerEl = document.querySelector(`[data-croupier-crono="${croupier}"] .timer`);
        if (timerEl) timerEl.textContent = tiempo;
        if (croupierCronoActivo === croupier) DOM.cronoModalTimer.textContent = tiempo;
    }

    function abrirQuickAddModal() {
        DOM.quickAddModal.style.display = 'flex';
        DOM.quickAddSearchInput.value = '';
        renderCroupierListInModal();
    }

    function renderCroupierListInModal(searchTerm = '') {
        DOM.quickAddCroupierList.innerHTML = '';
        const available = croupiersEnEspera.filter(c => !croupiersData.some(cd => cd.nombreCompleto === c.nombreCompleto));
        const filteredByContract = quickAddCurrentFilter === 'todos' ? available : available.filter(c => c.contrato === quickAddCurrentFilter);
        const filteredBySearch = filteredByContract.filter(c => c.nombreCompleto.toLowerCase().includes(searchTerm.toLowerCase()));
        filteredBySearch.forEach(croupier => {
            const li = document.createElement('li');
            li.innerHTML = `<input type="checkbox" value="${croupier.nombreCompleto}"> <span>${croupier.nombreCompleto}</span>`;
            DOM.quickAddCroupierList.appendChild(li);
        });
        DOM.quickAddCroupierList.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
            const anyChecked = DOM.quickAddCroupierList.querySelector('input:checked');
            DOM.btnAddSelectedToTable.disabled = !anyChecked;
        }));
    }

    function agregarCroupiersSeleccionadosDelModal() {
        const selected = DOM.quickAddCroupierList.querySelectorAll('input:checked');
        selected.forEach(cb => {
            const nombre = cb.value;
            const croupierDb = croupiersEnEspera.find(c => c.nombreCompleto === nombre);
            if (croupierDb && !croupiersData.some(c => c.nombreCompleto === nombre)) {
                croupiersData.push(croupierDb);
            }
        });
        guardarDatosEnLocalStorage();
        renderizarHorario();
        cerrarModales();
    }

    function mostrarTooltip(nombre, elemento) {
        const croupier = croupiersEnEspera.find(c => c.nombreCompleto === nombre);
        if (!croupier || !croupier.juegosQuePaga) return;
        DOM.croupierTooltip.innerHTML = `<h5>Juegos:</h5><ul>${croupier.juegosQuePaga.map(j => `<li>${j}</li>`).join('') || '<li>Ninguno</li>'}</ul>`;
        const rect = elemento.getBoundingClientRect();
        DOM.croupierTooltip.style.left = `${rect.left + window.scrollX}px`;
        DOM.croupierTooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
        DOM.croupierTooltip.style.display = 'block';
    }

    function ocultarTooltip() { DOM.croupierTooltip.style.display = 'none'; }
    function cerrarModales() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }

    function setupHelpPopovers() {
        const popover = document.getElementById('help-popover');
        const body    = document.getElementById('help-popover-body');
        const closeBtn = document.getElementById('help-popover-close');

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.help-btn');
            if (btn) {
                e.stopPropagation();
                const key = btn.dataset.help;
                body.innerHTML = HELP_TEXTS[key] || 'Sin información disponible.';
                popover.style.display = 'block';

                // Posicionamiento relativo al botón, ajustado al viewport
                const r = btn.getBoundingClientRect();
                let top  = r.bottom + 8;
                let left = r.left;
                const pw = popover.offsetWidth || 280;
                const ph = popover.offsetHeight || 200;
                if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12;
                if (left < 8) left = 8;
                if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;
                popover.style.left = left + 'px';
                popover.style.top  = top  + 'px';
                return;
            }
            if (!popover.contains(e.target)) popover.style.display = 'none';
        });

        closeBtn.addEventListener('click', () => { popover.style.display = 'none'; });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') popover.style.display = 'none'; });
    }

    // ── Auth & Solicitudes (Operador) ─────────────────────────
    function cerrarSesion() {
        localStorage.removeItem('userRole');
        localStorage.removeItem('loginTime');
        window.location.href = 'login.html';
    }

    async function cargarNotificacionesSolicitudes() {
        try {
            const fechaStr = getLocalDateString(fechaVisible);
            const res = await fetch(`${URL_DEL_SCRIPT_DE_HORARIOS}?action=solicitudes&fecha=${fechaStr}&estado=pendiente&t=${Date.now()}`);
            const data = await res.json();
            const count = data.solicitudes?.length || 0;
            const badge = document.getElementById('notif-badge');
            const bell  = document.getElementById('btn-notif');

            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            }

            // Carga inicial: si ya hay pendientes, marcar como no vistas
            if (solicitudesPrevCount === -1 && count > 0) {
                haySolicitudesNoVistas = true;
            }

            // Llegaron nuevas solicitudes desde el último chequeo
            if (solicitudesPrevCount >= 0 && count > solicitudesPrevCount) {
                const nuevas = count - solicitudesPrevCount;
                mostrarToast(nuevas === 1 ? '🔔 Nueva solicitud de supervisor' : `🔔 ${nuevas} nuevas solicitudes de supervisor`);
                haySolicitudesNoVistas = true;
                // Pulso puntual del badge
                if (badge) {
                    badge.classList.remove('notif-pulse');
                    void badge.offsetWidth;
                    badge.classList.add('notif-pulse');
                }
            }

            // Sin solicitudes pendientes → limpiar estado
            if (count === 0) haySolicitudesNoVistas = false;

            // Campana: persistente si hay no-vistas, quieta si no
            if (bell) {
                bell.classList.toggle('bell-has-unread', haySolicitudesNoVistas && count > 0);
            }

            solicitudesPrevCount = count;
        } catch { /* silencioso */ }
    }

    function mostrarToast(mensaje, duracion = 4500) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = mensaje;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-saliendo');
            setTimeout(() => toast.remove(), 400);
        }, duracion - 400);
    }

    async function abrirSolicitudesModal() {
        const modal = document.getElementById('solicitudes-modal');
        modal.style.display = 'flex';
        const container = document.getElementById('solicitudes-container');
        container.innerHTML = '<p style="text-align:center;color:var(--text-secondary-color);padding:20px 0">Cargando…</p>';
        try {
            const fechaStr = getLocalDateString(fechaVisible);
            const res = await fetch(`${URL_DEL_SCRIPT_DE_HORARIOS}?action=solicitudes&fecha=${fechaStr}&t=${Date.now()}`);
            const data = await res.json();
            if (data.found === false && !data.solicitudes) {
                container.innerHTML = '<p style="color:var(--danger-color);text-align:center;padding:20px 0">Error al cargar. Verificá que el script de Google esté actualizado.</p>';
                return;
            }
            renderizarSolicitudesOperador(data.solicitudes || [], container);
        } catch {
            container.innerHTML = '<p style="color:var(--danger-color);text-align:center;padding:20px 0">Error al cargar solicitudes.</p>';
        }
    }

    function renderizarSolicitudesOperador(lista, container) {
        if (!lista.length) {
            container.innerHTML = '<p style="color:var(--text-secondary-color);text-align:center;padding:20px 0">No hay solicitudes.</p>';
            return;
        }
        const ESTADOS = {
            pendiente: { icon: '🟡', label: 'Pendiente', bg: 'rgba(243,156,18,0.15)', color: '#b7770d' },
            aprobado:  { icon: '✅', label: 'Aprobado',  bg: 'rgba(46,204,113,0.15)',  color: '#1a8a45' },
            rechazado: { icon: '❌', label: 'Rechazado', bg: 'rgba(231,76,60,0.15)',   color: '#c0392b' },
        };
        container.innerHTML = lista.map(s => {
            const est = ESTADOS[s.estado] || ESTADOS.pendiente;
            const isPendiente = s.estado === 'pendiente';
            return `<div style="border:1px solid var(--border-color);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:var(--bg-color);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                    <span style="font-weight:700;font-size:0.88em;">${s.tipo || 'Solicitud'}</span>
                    <span style="font-size:0.78em;font-weight:600;padding:2px 8px;border-radius:10px;background:${est.bg};color:${est.color};">${est.icon} ${est.label}</span>
                </div>
                ${s.mesa     ? `<div style="font-size:0.84em;margin-bottom:4px;"><b>Mesa:</b> ${s.mesa}</div>` : ''}
                ${s.croupier ? `<div style="font-size:0.84em;margin-bottom:4px;"><b>Croupier:</b> ${s.croupier}</div>` : ''}
                <div style="font-size:0.84em;padding:8px 10px;background:var(--surface-color);border-radius:6px;border:1px solid var(--border-color);margin:6px 0;">${s.descripcion}</div>
                ${s.respuesta ? `<div style="font-size:0.82em;color:var(--primary-color);margin-top:6px;padding:6px 10px;background:rgba(52,152,219,0.08);border-radius:6px;">💬 ${s.respuesta}</div>` : ''}
                <div style="font-size:0.73em;color:var(--text-secondary-color);margin-top:6px;">${s.supervisor} — ${new Date(s.fecha).toLocaleString('es-ES', {dateStyle:'short',timeStyle:'short'})}</div>
                ${isPendiente ? `<div style="display:flex;gap:8px;margin-top:10px;align-items:center;">
                    <input type="text" data-id="${s.id}" class="sol-respuesta-input" placeholder="Respuesta (opcional)" style="flex:1;padding:6px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-color);color:var(--text-color);font-size:0.85em;font-family:inherit;min-width:0;">
                    <button class="sol-btn-aprobar" data-id="${s.id}" style="padding:6px 12px;border:none;border-radius:6px;background:#27ae60;color:white;cursor:pointer;font-size:0.82em;font-weight:600;white-space:nowrap;">✅ Aprobar</button>
                    <button class="sol-btn-rechazar" data-id="${s.id}" style="padding:6px 12px;border:none;border-radius:6px;background:#e74c3c;color:white;cursor:pointer;font-size:0.82em;font-weight:600;white-space:nowrap;">❌ Rechazar</button>
                </div>` : ''}
            </div>`;
        }).join('');

        container.querySelectorAll('.sol-btn-aprobar').forEach(btn => {
            btn.addEventListener('click', () => responderSolicitudDesdeOperador(btn.dataset.id, 'aprobado', container));
        });
        container.querySelectorAll('.sol-btn-rechazar').forEach(btn => {
            btn.addEventListener('click', () => responderSolicitudDesdeOperador(btn.dataset.id, 'rechazado', container));
        });
    }

    async function responderSolicitudDesdeOperador(id, estado, container) {
        const input = container.querySelector(`.sol-respuesta-input[data-id="${id}"]`);
        const respuesta = input ? input.value.trim() : '';
        try {
            const res = await fetch(URL_DEL_SCRIPT_DE_HORARIOS, {
                method: 'POST',
                body: JSON.stringify({ action: 'responderSolicitud', id, estado, respuesta })
            });
            const data = await res.json();
            if (data.success) {
                await abrirSolicitudesModal();
                cargarNotificacionesSolicitudes();
            } else {
                showModal('Error', 'No se pudo actualizar la solicitud.', 'error');
            }
        } catch {
            showModal('Error', 'Error de conexión.', 'error');
        }
    }

    function abrirConfigPasswordsModal() {
        document.getElementById('pass-actual').value = '';
        document.getElementById('pass-nueva-operador').value = '';
        document.getElementById('pass-nueva-supervisor').value = '';
        document.getElementById('config-pass-modal').style.display = 'flex';
        document.getElementById('config-dropdown').classList.remove('open');
    }

    async function guardarConfigPasswords() {
        const passActual       = document.getElementById('pass-actual').value.trim();
        const nuevaOperador    = document.getElementById('pass-nueva-operador').value.trim();
        const nuevaSupervisor  = document.getElementById('pass-nueva-supervisor').value.trim();
        if (!passActual) { showModal('Error', 'Ingresá la contraseña actual.', 'error'); return; }
        if (!nuevaOperador && !nuevaSupervisor) { showModal('Error', 'Ingresá al menos una contraseña nueva.', 'error'); return; }

        const btn = document.getElementById('btn-guardar-passwords');
        btn.disabled = true;
        btn.textContent = 'Guardando…';

        try {
            const res = await fetch(URL_DEL_SCRIPT_DE_HORARIOS, {
                method: 'POST',
                body: JSON.stringify({ action: 'updateConfig', passActual, nuevaOperador, nuevaSupervisor })
            });
            const data = await res.json();
            if (data.success) {
                cerrarModales();
                showModal('Éxito', 'Contraseñas actualizadas correctamente.', 'success');
            } else {
                showModal('Error', data.message || 'No se pudo actualizar.', 'error');
            }
        } catch {
            showModal('Error', 'Error de conexión.', 'error');
        }

        btn.disabled = false;
        btn.textContent = 'Guardar';
    }

    function cargarFichasData() {
        try {
            const raw = JSON.parse(localStorage.getItem('fichasData') || '{}');
            fichasData = {};
            for (const [mesa, val] of Object.entries(raw || {})) {
                if (!val || typeof val !== 'object') {
                    fichasData[mesa] = { inventario: {}, horas: [] };
                } else if (val.inventario !== undefined || val.horas !== undefined) {
                    fichasData[mesa] = { inventario: val.inventario || {}, horas: val.horas || [] };
                } else {
                    fichasData[mesa] = { inventario: val, horas: [] };
                }
            }
        } catch { fichasData = {}; }
    }

    function guardarFichasData() {
        localStorage.setItem('fichasData', JSON.stringify(fichasData));
    }

    function getMesaData(mesa) {
        if (!fichasData[mesa] || typeof fichasData[mesa] !== 'object') fichasData[mesa] = { inventario: {}, horas: [] };
        if (!fichasData[mesa].inventario) fichasData[mesa].inventario = {};
        if (!fichasData[mesa].horas) fichasData[mesa].horas = [];
        return fichasData[mesa];
    }

    function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    function calcTotalInventario(inv) {
        return DENOMINACIONES.reduce((s, d) => s + d * (parseInt(inv[String(d)]) || 0), 0);
    }
    function calcNetoHora(h) {
        return (parseInt(h.cambios) || 0) - (h.drops || []).reduce((s, dr) => s + (parseInt(dr.monto) || 0), 0);
    }
    function calcNetoMesa(datos) {
        return (datos.horas || []).reduce((s, h) => s + calcNetoHora(h), 0);
    }

    function actualizarSummaryPanel(panel) {
        const mesa = panel.dataset.mesa;
        const datos = getMesaData(mesa);
        const chips = calcTotalInventario(datos.inventario);
        const neto = calcNetoMesa(datos);
        const chipsEl = panel.querySelector('.fichas-summary-chips');
        const netEl   = panel.querySelector('.fichas-summary-net');
        if (chipsEl) chipsEl.textContent = chips > 0 ? `Chips: $${fmtFichas(chips)}` : 'Sin fichas';
        if (netEl)   netEl.textContent   = neto  > 0 ? `Neto: $${fmtFichas(neto)}`  : '';
    }

    function abrirFichasModal() {
        cargarFichasData();
        const mesas = mesasHabilitadas.length > 0 ? mesasHabilitadas : mesasDeJuego;
        const content = document.getElementById('fichas-content');
        content.innerHTML = '';
        if (!mesas.length) {
            content.innerHTML = '<p style="text-align:center;color:var(--text-secondary-color);padding:24px 0">No hay mesas configuradas. Usá "Mesas del turno" para activarlas.</p>';
        } else {
            mesas.forEach(mesa => content.appendChild(crearPanelFichas(mesa)));
        }
        document.getElementById('fichas-modal').style.display = 'flex';
    }

    function crearPanelFichas(mesa) {
        const datos = getMesaData(mesa);
        const chips  = calcTotalInventario(datos.inventario);
        const neto   = calcNetoMesa(datos);

        const panel = document.createElement('details');
        panel.className = 'fichas-mesa-panel';
        panel.dataset.mesa = mesa;

        // ── Summary (collapsed header) ─────────────────────────
        const summary = document.createElement('summary');
        summary.className = 'fichas-mesa-summary';
        summary.innerHTML =
            `<span class="fichas-summary-name">🎰 ${mesa}</span>` +
            `<span class="fichas-summary-chips">${chips > 0 ? `Chips: $${fmtFichas(chips)}` : 'Sin fichas'}</span>` +
            `<span class="fichas-summary-net">${neto > 0 ? `Neto: $${fmtFichas(neto)}` : ''}</span>`;
        panel.appendChild(summary);

        // ── Section 1: Inventario de Fichas ───────────────────
        const secInv = document.createElement('div');
        secInv.className = 'fichas-section';

        const invTitleRow = document.createElement('div');
        invTitleRow.className = 'fichas-section-title-row';
        invTitleRow.innerHTML = '<span class="fichas-section-title">Inventario de Fichas</span>';
        secInv.appendChild(invTitleRow);

        const tabla = document.createElement('div');
        tabla.className = 'fichas-tabla';

        DENOMINACIONES.forEach(den => {
            const qty = parseInt(datos.inventario[String(den)]) || 0;
            const row = document.createElement('div');
            row.className = 'fichas-row';
            row.innerHTML =
                `<span class="fichas-den">${fmtFichas(den)}</span>` +
                `<span class="fichas-sep">—</span>` +
                `<input type="number" class="fichas-cantidad" min="0" value="${qty || ''}" placeholder="0">` +
                `<span class="fichas-sep">—</span>` +
                `<span class="fichas-total">${qty > 0 ? fmtFichas(den * qty) : '—'}</span>`;
            const input     = row.querySelector('.fichas-cantidad');
            const totalSpan = row.querySelector('.fichas-total');
            input.addEventListener('input', () => {
                const q = Math.max(0, parseInt(input.value) || 0);
                totalSpan.textContent = q > 0 ? fmtFichas(den * q) : '—';
                datos.inventario[String(den)] = q;
                const gt = calcTotalInventario(datos.inventario);
                tabla.querySelector('.fichas-grand-total').textContent = gt > 0 ? fmtFichas(gt) : '—';
                actualizarSummaryPanel(panel);
                guardarFichasData();
            });
            tabla.appendChild(row);
        });

        const gt = calcTotalInventario(datos.inventario);
        const totalRow = document.createElement('div');
        totalRow.className = 'fichas-row fichas-total-row';
        totalRow.innerHTML = `<span></span><span></span><span class="fichas-lbl-total">TOTAL</span><span></span><span class="fichas-grand-total">${gt > 0 ? fmtFichas(gt) : '—'}</span>`;
        tabla.appendChild(totalRow);

        const clearRow = document.createElement('div');
        clearRow.className = 'fichas-clear-row';
        const clearBtn = document.createElement('button');
        clearBtn.className = 'fichas-clear-btn';
        clearBtn.textContent = '🗑️ Limpiar fichas';
        clearBtn.addEventListener('click', () => {
            datos.inventario = {};
            tabla.querySelectorAll('.fichas-cantidad').forEach(inp => { inp.value = ''; });
            tabla.querySelectorAll('.fichas-total').forEach(s => { s.textContent = '—'; });
            tabla.querySelector('.fichas-grand-total').textContent = '—';
            actualizarSummaryPanel(panel);
            guardarFichasData();
        });
        clearRow.appendChild(clearBtn);
        tabla.appendChild(clearRow);
        secInv.appendChild(tabla);
        panel.appendChild(secInv);

        // ── Section 2: Cambios y Fichas Drop ──────────────────
        const secCambios = document.createElement('div');
        secCambios.className = 'fichas-section fichas-cambios-section';

        const cambiosTitleRow = document.createElement('div');
        cambiosTitleRow.className = 'fichas-section-title-row';
        cambiosTitleRow.innerHTML = '<span class="fichas-section-title">Cambios y Fichas Drop</span>';
        secCambios.appendChild(cambiosTitleRow);

        // Add form: [hora] [monto] [Agregar]
        const addForm = document.createElement('div');
        addForm.className = 'fichas-add-form';
        addForm.innerHTML =
            `<input type="time" class="fichas-form-hora">` +
            `<input type="text" class="fichas-form-monto" placeholder="Cambios $" inputmode="numeric">` +
            `<button class="fichas-form-agregar">Agregar</button>`;
        setupMoneyInput(addForm.querySelector('.fichas-form-monto'));
        secCambios.appendChild(addForm);

        // List of hour entries
        const lista = document.createElement('div');
        lista.className = 'fichas-horas-lista';
        [...(datos.horas || [])].sort((a, b) => (b.hora || '').localeCompare(a.hora || '')).forEach(h => {
            lista.appendChild(crearHoraRow(h, datos, panel));
        });
        secCambios.appendChild(lista);

        addForm.querySelector('.fichas-form-agregar').addEventListener('click', () => {
            const horaVal  = addForm.querySelector('.fichas-form-hora').value;
            const montoVal = parseInt(addForm.querySelector('.fichas-form-monto').value.replace(/\D/g, '')) || 0;
            if (!horaVal && !montoVal) return;
            const newH = { id: genId(), hora: horaVal, cambios: montoVal, drops: [] };
            datos.horas.push(newH);
            guardarFichasData();
            actualizarSummaryPanel(panel);
            const newRow = crearHoraRow(newH, datos, panel);
            const existing = lista.querySelectorAll('.fichas-hora-row');
            let placed = false;
            for (const r of existing) {
                if ((newH.hora || '') >= (r.dataset.hora || '')) { lista.insertBefore(newRow, r); placed = true; break; }
            }
            if (!placed) lista.appendChild(newRow);
            addForm.querySelector('.fichas-form-hora').value = '';
            addForm.querySelector('.fichas-form-monto').value = '';
        });

        panel.appendChild(secCambios);
        return panel;
    }

    function setupMoneyInput(input) {
        input.addEventListener('input', () => {
            const raw = input.value.replace(/\D/g, '');
            const num = parseInt(raw) || 0;
            input.value = num > 0 ? num.toLocaleString('es-AR') : '';
        });
    }

    function crearHoraRow(horaObj, datos, panel) {
        const row = document.createElement('div');
        row.className = 'fichas-hora-row';
        row.dataset.hora   = horaObj.hora || '';
        row.dataset.horaId = horaObj.id;

        function dropTotal() { return (horaObj.drops || []).reduce((s, d) => s + (parseInt(d.monto) || 0), 0); }

        function actualizarRowNeto() {
            const n  = calcNetoHora(horaObj);
            const dt = dropTotal();
            const netoBadge = row.querySelector('.fichas-row-neto');
            const dropBadge = row.querySelector('.fichas-row-drop-tot');
            if (netoBadge) {
                netoBadge.textContent = `Neto: $${fmtFichas(Math.abs(n))}`;
                netoBadge.className   = 'fichas-row-neto' + (n < 0 ? ' neto-negativo' : '');
            }
            if (dropBadge) {
                dropBadge.textContent = dt > 0 ? `Drop: $${fmtFichas(dt)}` : '';
                dropBadge.className   = 'fichas-row-drop-tot' + (dt > 0 ? ' has-drop' : '');
            }
            actualizarSummaryPanel(panel);
        }

        const neto = calcNetoHora(horaObj);
        const dt   = dropTotal();
        row.innerHTML =
            `<div class="fichas-row-main">` +
                `<span class="fichas-row-hora">${horaObj.hora || '—'}</span>` +
                `<span class="fichas-row-cambios">$${fmtFichas(horaObj.cambios || 0)}</span>` +
                `<span class="fichas-row-drop-tot${dt > 0 ? ' has-drop' : ''}">${dt > 0 ? `Drop: $${fmtFichas(dt)}` : ''}</span>` +
                `<span class="fichas-row-neto${neto < 0 ? ' neto-negativo' : ''}">Neto: $${fmtFichas(Math.abs(neto))}</span>` +
                `<button class="fichas-row-drop-btn" title="Agregar ficha drop">🪙 Drop</button>` +
                `<button class="fichas-row-del" title="Eliminar">×</button>` +
            `</div>` +
            `<div class="fichas-drops-sub" style="display:none">` +
                `<div class="fichas-drops-list"></div>` +
                `<div class="fichas-inline-form" style="display:none">` +
                    `<input type="text" class="fichas-inline-monto" placeholder="Monto drop" inputmode="numeric">` +
                    `<button class="fichas-inline-ok">✓</button>` +
                    `<button class="fichas-inline-cancel">✕</button>` +
                `</div>` +
            `</div>`;

        const dropsSub  = row.querySelector('.fichas-drops-sub');
        const dropsList = row.querySelector('.fichas-drops-list');
        if ((horaObj.drops || []).length > 0) {
            dropsSub.style.display = 'block';
            horaObj.drops.forEach(dr => dropsList.appendChild(crearMiniDrop(dr, horaObj, row, actualizarRowNeto)));
        }

        row.querySelector('.fichas-row-del').addEventListener('click', () => {
            datos.horas = datos.horas.filter(h => h.id !== horaObj.id);
            guardarFichasData();
            actualizarSummaryPanel(panel);
            row.remove();
        });

        const inlineForm  = row.querySelector('.fichas-inline-form');
        const inlineMonto = row.querySelector('.fichas-inline-monto');
        setupMoneyInput(inlineMonto);

        row.querySelector('.fichas-row-drop-btn').addEventListener('click', () => {
            dropsSub.style.display = 'block';
            inlineForm.style.display = 'flex';
            inlineMonto.value = '';
            inlineMonto.focus();
        });

        const confirmarDrop = () => {
            const monto = parseInt(inlineMonto.value.replace(/\D/g, '')) || 0;
            if (!monto) { inlineMonto.focus(); return; }
            const newDrop = { id: genId(), monto };
            horaObj.drops = horaObj.drops || [];
            horaObj.drops.push(newDrop);
            guardarFichasData();
            dropsList.appendChild(crearMiniDrop(newDrop, horaObj, row, actualizarRowNeto));
            actualizarRowNeto();
            inlineForm.style.display = 'none';
            inlineMonto.value = '';
        };
        row.querySelector('.fichas-inline-ok').addEventListener('click', confirmarDrop);
        inlineMonto.addEventListener('keydown', e => {
            if (e.key === 'Enter') confirmarDrop();
            if (e.key === 'Escape') row.querySelector('.fichas-inline-cancel').click();
        });
        row.querySelector('.fichas-inline-cancel').addEventListener('click', () => {
            inlineForm.style.display = 'none';
        });

        return row;
    }

    function crearMiniDrop(dr, horaObj, row, actualizarRowNeto) {
        const item = document.createElement('div');
        item.className = 'fichas-mini-drop';
        item.innerHTML =
            `<span>🪙</span>` +
            `<span class="fichas-drop-amt">$${fmtFichas(dr.monto)}</span>` +
            `<span class="fichas-drop-badge">Drop ingresado</span>` +
            `<button class="fichas-drop-del">×</button>`;
        item.querySelector('.fichas-drop-del').addEventListener('click', () => {
            horaObj.drops = horaObj.drops.filter(d => d.id !== dr.id);
            guardarFichasData();
            actualizarRowNeto();
            item.remove();
            if ((horaObj.drops || []).length === 0) {
                const sub = row.querySelector('.fichas-drops-sub');
                if (sub) sub.style.display = 'none';
            }
        });
        return item;
    }


    function setupEventListeners() {
        DOM.btnAplicarColor.addEventListener('click', aplicarColor);
        DOM.fechaDisplay.addEventListener('click', abrirFechaModal);
        document.querySelectorAll('.modal .close-btn').forEach(btn => btn.addEventListener('click', cerrarModales));
        document.getElementById('btn-guardar-relevo').addEventListener('click', guardarRelevo);
        document.getElementById('btn-borrar-relevo').addEventListener('click', borrarRelevo);
        document.getElementById('btn-guardar-nuevo-horario').addEventListener('click', guardarNuevoHorario);
        document.getElementById('btn-guardar-salida').addEventListener('click', guardarSalida);
        document.getElementById('btn-borrar-salida').addEventListener('click', borrarSalida);
        document.getElementById('btn-guardar-nueva-fecha').addEventListener('click', guardarNuevaFecha);
        DOM.opcionRelevo.addEventListener('change', () => toggleRelevoControls('releva'));
        DOM.opcionAyudante.addEventListener('change', () => toggleRelevoControls('ayudante'));
        DOM.opcionDescanso.addEventListener('change', () => toggleRelevoControls('descanso'));
        document.getElementById('relevo-modal').addEventListener('click', e => {
            const item = e.target.classList.contains('mesa-item') ? e.target : e.target.closest?.('.mesa-item');
            if (item) {
                if (item.classList.contains('mesa-ocupada')) return; // bloqueada
                const targetList = item.parentElement.id === 'mesas-disponibles' ? 'mesas-seleccionadas' : 'mesas-disponibles';
                document.getElementById(targetList).appendChild(item);
            }
        });
        document.getElementById('crono-btn-start').addEventListener('click', () => {
            if (croupierCronoActivo) iniciarCronometro(croupierCronoActivo, new Date().getTime(), true);
            openCronoModal(croupierCronoActivo);
        });
        document.getElementById('crono-btn-stop').addEventListener('click', () => {
            if (croupierCronoActivo) detenerCronometro(croupierCronoActivo, false, true);
            openCronoModal(croupierCronoActivo);
        });
        document.getElementById('btn-reset').addEventListener('click', () => {
            if (croupierCronoActivo) detenerCronometro(croupierCronoActivo, true, true);
            openCronoModal(croupierCronoActivo);
        });
        document.getElementById('btn-set-manual-time').addEventListener('click', ajustarTiempoManualCrono);
        DOM.quickAddSelector.addEventListener('click', abrirQuickAddModal);
        DOM.quickAddSearchInput.addEventListener('input', e => renderCroupierListInModal(e.target.value));
        DOM.quickAddFilterButtons.addEventListener('click', e => {
            if (e.target.classList.contains('filter-btn')) {
                DOM.quickAddFilterButtons.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                quickAddCurrentFilter = e.target.dataset.filter;
                renderCroupierListInModal(DOM.quickAddSearchInput.value);
            }
        });
        DOM.btnAddSelectedToTable.addEventListener('click', agregarCroupiersSeleccionadosDelModal);
        document.getElementById('btn-limpiar-croupiers').addEventListener('click', limpiarCroupiers);
        document.getElementById('btn-limpiar-horarios').addEventListener('click', limpiarHorarios);
        document.getElementById('btn-mesas-turno').addEventListener('click', abrirMesasTurnoModal);
        document.getElementById('btn-mesas-turno-guardar').addEventListener('click', guardarMesasTurno);
        document.getElementById('btn-mesas-turno-todas').addEventListener('click', () => {
            document.querySelectorAll('#mesas-turno-grid .mesa-turno-chip').forEach(c => c.classList.add('activa'));
        });
        document.getElementById('btn-mesas-turno-ninguna').addEventListener('click', () => {
            document.querySelectorAll('#mesas-turno-grid .mesa-turno-chip').forEach(c => c.classList.remove('activa'));
        });
        document.getElementById('btn-stats').addEventListener('click', () => {
            abrirStatsModal();
        });
        document.getElementById('btn-close-stats').addEventListener('click', cerrarModales);
        document.getElementById('stats-tabs').addEventListener('click', (e) => {
            if (e.target.classList.contains('stats-tab-btn')) {
                document.querySelectorAll('.stats-tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                renderStatsTab(e.target.dataset.tab, calcularEstadisticas());
            }
        });
        document.getElementById('btn-notif').addEventListener('click', () => {
            haySolicitudesNoVistas = false;
            solicitudesPrevCount = -1;
            document.getElementById('btn-notif').classList.remove('bell-has-unread');
            abrirSolicitudesModal();
        });
        document.getElementById('btn-cerrar-sesion').addEventListener('click', cerrarSesion);
        document.getElementById('btn-config-passwords').addEventListener('click', abrirConfigPasswordsModal);
        document.getElementById('btn-guardar-passwords').addEventListener('click', guardarConfigPasswords);
        document.getElementById('btn-fichas-mesa').addEventListener('click', abrirFichasModal);
        document.getElementById('btn-fichas-cerrar').addEventListener('click', cerrarModales);
    }

    function calcularEstadisticas() {
        const sorted = [...horarios].sort(sortHorarios);
        const result = { porCroupier: {}, porMesa: {} };
        const croupiersEnTabla = croupiersData.map(c => c.nombreCompleto);

        const toMinutes = (h) => {
            const [hr, mn] = h.split(':').map(Number);
            return (hr < 6 ? hr + 24 : hr) * 60 + mn;
        };

        croupiersEnTabla.forEach(c => {
            result.porCroupier[c] = { minutosMesa: {}, minutosAyudante: 0, minutosDescanso: 0, totalMinutos: 0, mesaPrincipal: '' };
        });

        sorted.forEach((hora, idx) => {
            const horaMin = toMinutes(hora);
            const nextMin = idx < sorted.length - 1 ? toMinutes(sorted[idx + 1]) : null;

            croupiersEnTabla.forEach(c => {
                // Ignorar slots en o después de la hora de salida
                const salidaStr = croupierSalidas[c];
                const salidaMin = salidaStr ? toMinutes(salidaStr) : null;
                if (salidaMin !== null && horaMin >= salidaMin) return;

                const entry = datosRelevos[c]?.[hora];
                if (!entry) return;

                // Duración del slot, recortada por la hora de salida si aplica
                let dur;
                if (nextMin !== null) {
                    dur = (salidaMin !== null ? Math.min(nextMin, salidaMin) : nextMin) - horaMin;
                } else {
                    dur = salidaMin !== null ? Math.max(0, salidaMin - horaMin) : 30;
                }
                if (dur <= 0) return;

                result.porCroupier[c].totalMinutos += dur;
                if (entry.actividad === 'releva' && entry.mesas?.length) {
                    const perMesa = Math.round(dur / entry.mesas.length);
                    entry.mesas.forEach(mesa => {
                        result.porCroupier[c].minutosMesa[mesa] = (result.porCroupier[c].minutosMesa[mesa] || 0) + perMesa;
                        if (!result.porMesa[mesa]) result.porMesa[mesa] = { minutosTotal: 0, croupiers: [] };
                        result.porMesa[mesa].minutosTotal += perMesa;
                        const existing = result.porMesa[mesa].croupiers.find(x => x.nombre === c);
                        if (existing) existing.minutos += perMesa;
                        else result.porMesa[mesa].croupiers.push({ nombre: c, minutos: perMesa });
                    });
                } else if (entry.actividad === 'ayudante-pagador') {
                    result.porCroupier[c].minutosAyudante += dur;
                } else if (entry.actividad === 'descanso') {
                    result.porCroupier[c].minutosDescanso += dur;
                }
            });
        });

        Object.values(result.porMesa).forEach(m => m.croupiers.sort((a, b) => b.minutos - a.minutos));
        Object.values(result.porCroupier).forEach(d => {
            const entries = Object.entries(d.minutosMesa);
            if (entries.length) d.mesaPrincipal = entries.sort((a, b) => b[1] - a[1])[0][0];
        });

        return result;
    }

    function abrirStatsModal() {
        if (!horarios || !horarios.length) {
            showModal('Sin datos', 'No hay horario cargado para la fecha actual.', 'info');
            return;
        }
        const stats = calcularEstadisticas();
        const fechaStr = fechaVisible.toLocaleDateString('es-ES', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        document.getElementById('stats-fecha-titulo').textContent = fechaStr;
        document.getElementById('stats-modal').style.display = 'flex';
        document.querySelectorAll('.stats-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        renderStatsTab('resumen', stats);
    }

    function renderStatsTab(tab, stats) {
        const container = document.getElementById('stats-content');

        if (tab === 'resumen') {
            /* Solo croupiers con al menos una actividad asignada en el turno */
            const activos = Object.entries(stats.porCroupier)
                .filter(([, d]) => d.totalMinutos > 0)
                .sort((a, b) => b[1].totalMinutos - a[1].totalMinutos);

            const rows = activos.map(([nombre, d]) => {
                const fmt = (m) => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
                const totalMesa = Object.values(d.minutosMesa).reduce((s, v) => s + v, 0);
                const pctMesa   = d.totalMinutos > 0 ? Math.round(totalMesa / d.totalMinutos * 100) : 0;
                const pctDesc   = d.totalMinutos > 0 ? Math.round(d.minutosDescanso / d.totalMinutos * 100) : 0;
                const mesasStr  = Object.entries(d.minutosMesa)
                    .sort((a, b) => b[1] - a[1])
                    .map(([m, min]) => `${m} (${fmt(min)})`).join('<br>') || '—';
                return `<tr>
                    <td><strong>${nombre}</strong></td>
                    <td>${fmt(d.totalMinutos)}</td>
                    <td>${mesasStr}</td>
                    <td>${d.minutosAyudante > 0 ? fmt(d.minutosAyudante) : '—'}</td>
                    <td>${d.minutosDescanso > 0 ? fmt(d.minutosDescanso) + ` (${pctDesc}%)` : '—'}</td>
                    <td>${pctMesa}%</td>
                </tr>`;
            }).join('');

            container.innerHTML = `
                <p style="font-size:0.8em;color:var(--text-secondary-color);margin:0 0 8px 0;">
                    ${activos.length} croupier${activos.length !== 1 ? 's' : ''} con actividad registrada en este turno
                </p>
                <table class="stats-table">
                    <thead><tr>
                        <th>Croupier</th><th>Total turno</th><th>Mesas trabajadas</th>
                        <th>Ayudante Pag.</th><th>Descanso</th><th>% en mesa</th>
                    </tr></thead>
                    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;">Sin actividades registradas en la tabla</td></tr>'}</tbody>
                </table>`;

        } else if (tab === 'mesas') {
            const rows = Object.entries(stats.porMesa)
                .sort((a, b) => b[1].minutosTotal - a[1].minutosTotal)
                .map(([mesa, d]) => {
                    const fmt = (m) => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
                    const croupierList = d.croupiers
                        .map(c => `${c.nombre} (${fmt(c.minutos)})`).join('<br>');
                    return `<tr>
                        <td><strong>${mesa}</strong></td>
                        <td>${fmt(d.minutosTotal)}</td>
                        <td>${d.croupiers.length}</td>
                        <td>${croupierList}</td>
                    </tr>`;
                }).join('');
            container.innerHTML = `<table class="stats-table">
                <thead><tr><th>Mesa</th><th>Tiempo total ocupada</th><th># Croupiers</th><th>Croupiers asignados</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:20px;">Sin datos de mesas</td></tr>'}</tbody>
            </table>`;

        } else if (tab === 'descansos') {
            const rows = Object.entries(stats.porCroupier)
                .filter(([, d]) => d.totalMinutos > 0)
                .sort((a, b) => b[1].minutosDescanso - a[1].minutosDescanso)
                .map(([nombre, d]) => {
                    const fmt = (m) => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
                    const pct = d.totalMinutos > 0 ? Math.round(d.minutosDescanso / d.totalMinutos * 100) : 0;
                    const bar = `<div style="background:var(--border-color);border-radius:4px;overflow:hidden;height:8px;min-width:80px;">
                        <div style="background:${pct > 30 ? 'var(--danger-color)' : 'var(--success-color)'};width:${pct}%;height:100%;"></div>
                    </div>`;
                    return `<tr>
                        <td><strong>${nombre}</strong></td>
                        <td>${d.minutosDescanso > 0 ? fmt(d.minutosDescanso) : '—'}</td>
                        <td>${pct}% ${bar}</td>
                        <td>${fmt(d.totalMinutos - d.minutosDescanso - d.minutosAyudante)}</td>
                    </tr>`;
                }).join('');
            container.innerHTML = `<table class="stats-table">
                <thead><tr><th>Croupier</th><th>En descanso</th><th>% del turno</th><th>Tiempo activo</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:20px;">Sin croupiers con actividad</td></tr>'}</tbody>
            </table>`;

        } else if (tab === 'horarios') {
            /* Vista de actividad por horario — muestra el turno completo */
            const sorted = [...horarios].sort(sortHorarios);
            const croupiersEnTabla = croupiersData.map(c => c.nombreCompleto);
            const activos = croupiersEnTabla.filter(c =>
                sorted.some(h => datosRelevos[c]?.[h])
            );

            const headerCols = sorted.map(h => `<th>${h}</th>`).join('');
            const bodyRows = activos.map(c => {
                const cells = sorted.map(h => {
                    const entry = datosRelevos[c]?.[h];
                    if (!entry) return '<td style="background:var(--bg-color);"></td>';
                    if (entry.actividad === 'releva') {
                        const color = entry.color || '#3498db';
                        return `<td style="background:${color};color:#fff;font-size:0.7em;padding:2px;">${entry.mesas?.join('<br>') || ''}</td>`;
                    }
                    if (entry.actividad === 'descanso') return `<td style="background:#f59e0b;color:#000;font-size:0.7em;">DESC</td>`;
                    if (entry.actividad === 'ayudante-pagador') return `<td style="background:#8b5cf6;color:#fff;font-size:0.7em;">A.PAG</td>`;
                    return '<td></td>';
                }).join('');
                return `<tr><td style="white-space:nowrap;font-weight:bold;padding:4px 6px;">${c}</td>${cells}</tr>`;
            }).join('');

            container.innerHTML = `
                <div style="overflow-x:auto;">
                    <table class="stats-table" style="font-size:0.78em;">
                        <thead><tr><th>Croupier</th>${headerCols}</tr></thead>
                        <tbody>${bodyRows || '<tr><td colspan="${sorted.length+1}" style="text-align:center;padding:20px;">Sin datos</td></tr>'}</tbody>
                    </table>
                </div>`;
        }
    }

    inicializar();
});
