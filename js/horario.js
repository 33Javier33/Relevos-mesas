/* Lógica principal del Horario de Relevos (index.html) */
/* Depende de: js/shared.js (showModal, sortHorarios, crearTarjetaRelevo, getLocalDateString, generarAlias) */

document.addEventListener('DOMContentLoaded', () => {
    const URL_DEL_SCRIPT_DE_MAESTROS = 'https://script.google.com/macros/s/AKfycbzjaL7OKe1_doagry1eo0w15vXOJy_-oEtWreLTzj1GoQgxyE8cDI7jTgWm7qqThB7M/exec';
    const URL_DEL_SCRIPT_DE_HORARIOS = 'https://script.google.com/macros/s/AKfycbw1kBHYt37_X5K7UdBZlJNTgNT2B2P0t4F6uVrCKK_hDgZ7j09cwSzNx5l9CvHwFCTDQg/exec';

    let croupiersData = [], croupiersEnEspera = [], horarios = [], mesasDeJuego = [], datosRelevos = {}, croupierColors = {}, croupierSalidas = {}, horarioColors = {};
    let cronometroIntervals = {}, cronometroStartTime = {}, cronometroCurrentStartTime = {};
    let fechaVisible = new Date(), celdaActiva = { croupier: null, horario: null }, croupierCronoActivo = null, croupierSalidaActivo = null, quickAddCurrentFilter = 'todos';

    let saveTimeout;
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
            const datosAEnviar = {
                action: 'save',
                fecha: getLocalDateString(fechaVisible),
                horarios, datosRelevos,
                croupiersEnTabla: croupiersData.map(c => c.nombreCompleto),
                croupierColors, horarioColors,
                horasSalida: croupierSalidas,
                cronometros: cronometroStartTime
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
                saveTimeout = null;
            })
            .catch(err => {
                console.error("Error en la sincronización de guardado:", err);
                DOM.sincroStatus.textContent = 'ERROR de sincronización. Revisa la conexión.';
                saveTimeout = null;
            });
        }, 1500);
    }

    function guardarDatosEnLocalStorage(skipSheetsSync = false) {
        const dataToStore = {
            croupiersEnTabla: croupiersData.map(c => c.nombreCompleto),
            horarios, datosRelevos, croupierColors, croupierSalidas, horarioColors,
            cronometroState: cronometroStartTime,
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
        return true;
    }

    async function sincronizarDesdeSheets(forceRender = true) {
        const fechaISO = getLocalDateString(fechaVisible);
        try {
            if (saveTimeout && !forceRender) return;
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
        }, 30000);
    }

    async function cambiarFecha(nuevaFecha) {
        fechaVisible = nuevaFecha;
        actualizarFechaDisplay();
        if (!cargarHorarioDesdeLocalStorage()) {
            await sincronizarDesdeSheets(true);
        }
        renderizarHorario();
        reiniciarCronometrosActivos();
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
                        if (activity) {
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
        Array.from(DOM.selectCroupierDescanso.selectedOptions).forEach(opt => {
            const croupierDescanso = opt.value;
            if (!datosRelevos[croupierDescanso]) datosRelevos[croupierDescanso] = {};
            datosRelevos[croupierDescanso][horario] = { actividad: 'descanso' };
        });
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
        setInterval(actualizarSistema, 1000);
        iniciarSincronizacionAutomatica();

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

    function renderizarHorario() { renderizarCabecera(); renderizarCuerpo(); renderQuickAddSelector(); }

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
                if (relevoData) td.appendChild(crearTarjetaRelevo(relevoData));
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
        mesasDeJuego.forEach(mesa => {
            const mesaItem = `<div class="mesa-item" data-mesa="${mesa}">${mesa}</div>`;
            if (mesasRelevo.includes(mesa)) {
                mesasSeleccionadasDiv.innerHTML += mesaItem;
            } else {
                mesasDisponiblesDiv.innerHTML += mesaItem;
            }
        });
        DOM.colorRelevoInput.value = relevoExistente?.color || '#3498db';
        llenarSelectorDescansoManual();
        DOM.relevoModal.style.display = 'flex';
    }

    function toggleRelevoControls(actividad) {
        DOM.relevoControlsContainer.style.display = actividad === 'releva' ? 'block' : 'none';
    }

    function llenarSelectorDescansoManual() {
        DOM.selectCroupierDescanso.innerHTML = '';
        const sortedHorarios = [...horarios].sort(sortHorarios);
        const currentIndex = sortedHorarios.indexOf(celdaActiva.horario);
        croupiersData.forEach(c => {
            if (c.nombreCompleto === celdaActiva.croupier) return;
            let lastActivityInfo = ' (Sin Actividad Anterior)';
            for (let i = currentIndex - 1; i >= 0; i--) {
                const prevHorario = sortedHorarios[i];
                const relevoData = datosRelevos[c.nombreCompleto]?.[prevHorario];
                if (relevoData) {
                    if (relevoData.actividad === 'releva' && relevoData.mesas.length > 0) {
                        lastActivityInfo = ` (${relevoData.mesas.join(', ')})`;
                    } else if (relevoData.actividad === 'descanso') {
                        lastActivityInfo = ' (En Descanso)';
                    } else if (relevoData.actividad === 'ayudante-pagador') {
                        lastActivityInfo = ' (Ayud. Pagador)';
                    }
                    break;
                }
            }
            const option = document.createElement('option');
            option.value = c.nombreCompleto;
            option.textContent = generarAlias(c.nombreCompleto) + lastActivityInfo;
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
            if (e.target.classList.contains('mesa-item')) {
                const targetList = e.target.parentElement.id === 'mesas-disponibles' ? 'mesas-seleccionadas' : 'mesas-disponibles';
                document.getElementById(targetList).appendChild(e.target);
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
    }

    function calcularEstadisticas() {
        const sorted = [...horarios].sort(sortHorarios);
        const result = { porCroupier: {}, porMesa: {} };

        // Convert horarios to minutes-since-midnight (with overnight adjustment)
        const toMinutes = (h) => {
            const [hr, mn] = h.split(':').map(Number);
            return (hr < 6 ? hr + 24 : hr) * 60 + mn;
        };

        croupiersEnTabla.forEach(c => {
            result.porCroupier[c] = { minutosMesa: {}, minutosAyudante: 0, minutosDescanso: 0, totalMinutos: 0, mesaPrincipal: '' };
        });

        sorted.forEach((hora, idx) => {
            const dur = idx < sorted.length - 1
                ? toMinutes(sorted[idx + 1]) - toMinutes(hora)
                : 30;
            if (dur <= 0) return;

            croupiersEnTabla.forEach(c => {
                const entry = datosRelevos[c]?.[hora];
                if (!entry) return;
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

        // Sort croupiers in each mesa
        Object.values(result.porMesa).forEach(m => m.croupiers.sort((a, b) => b.minutos - a.minutos));

        // Determine mesa principal per croupier
        Object.values(result.porCroupier).forEach(d => {
            const entries = Object.entries(d.minutosMesa);
            if (entries.length) d.mesaPrincipal = entries.sort((a, b) => b[1] - a[1])[0][0];
        });

        return result;
    }

    function abrirStatsModal() {
        const stats = calcularEstadisticas();
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
