/* Lógica del Visualizador de Turno — Mobile (vista/index.html) */
/* Standalone: incluye sortHorarios y getLocalDateString directamente */

function sortHorarios(a, b) {
    let aHour = parseInt(a.split(':')[0], 10), bHour = parseInt(b.split(':')[0], 10);
    if (aHour < 6) aHour += 24;
    if (bHour < 6) bHour += 24;
    if (aHour < bHour) return -1;
    if (aHour > bHour) return 1;
    let aMin = parseInt(a.split(':')[1], 10), bMin = parseInt(b.split(':')[1], 10);
    return aMin - bMin;
}

function getLocalDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const URL_DEL_SCRIPT_DE_HORARIOS = 'https://script.google.com/macros/s/AKfycbw1kBHYt37_X5K7UdBZlJNTgNT2B2P0t4F6uVrCKK_hDgZ7j09cwSzNx5l9CvHwFCTDQg/exec';

    let datosCompletosDelHorario = null;
    let indiceActual = 0;
    let filtroBusqueda = '';
    const COLUMNAS_VISIBLES = 2;
    let timerInterval = null;
    let refreshInterval = null;
    let cronometroIntervals = {};
    let isAutoScrolling = true;

    const fechaSelector = document.getElementById('fecha-selector');
    const busquedaInput = document.getElementById('busqueda-personal');

    /* Reloj */
    const updateClock = () => {
        document.getElementById('current-time').textContent = new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
    };
    setInterval(updateClock, 1000);
    updateClock();

    /* Tarjeta de relevo — usa clase .relevo-cell-view (diseño mobile) */
    function crearTarjetaRelevoVista(data) {
        const div = document.createElement('div');
        div.className = 'relevo-cell-view';
        switch (data.actividad) {
            case 'releva':
                div.style.background = `linear-gradient(135deg, ${data.color}dd, ${data.color})`;
                div.textContent = data.mesas.join('\n');
                break;
            case 'ayudante-pagador':
                div.classList.add('ayudante-pagador');
                div.textContent = 'A. PAG';
                break;
            case 'descanso':
                div.classList.add('descanso');
                div.textContent = 'DESC.';
                break;
            default:
                div.style.backgroundColor = '#475569';
                div.textContent = 'S/A';
        }
        return div;
    }

    /* Carga inicial o recarga forzada */
    const loadSchedule = async (fecha, isInitialLoad = true) => {
        if (isInitialLoad) {
            document.getElementById('status-message').textContent = 'Consultando...';
            document.getElementById('status-message').style.display = 'block';
            document.getElementById('horario-wrapper').style.display = 'none';
            if (timerInterval) clearInterval(timerInterval);
            if (refreshInterval) clearInterval(refreshInterval);
            Object.values(cronometroIntervals).forEach(clearInterval);
            cronometroIntervals = {};
            isAutoScrolling = true;
        }
        try {
            const response = await fetch(`${URL_DEL_SCRIPT_DE_HORARIOS}?action=load&fecha=${fecha}&t=${new Date().getTime()}`);
            const newData = await response.json();
            if (isInitialLoad) {
                datosCompletosDelHorario = newData;
                if (newData && newData.found) {
                    document.getElementById('status-message').style.display = 'none';
                    document.getElementById('horario-wrapper').style.display = 'block';
                    newData.horarios.sort(sortHorarios);
                    renderCurrentView();
                    actualizarSistema();
                    timerInterval = setInterval(actualizarSistema, 1000);
                    refreshInterval = setInterval(() => loadSchedule(fechaSelector.value, false), 15000);
                } else {
                    handleNoSchedule();
                }
            } else if (newData && newData.found) {
                updateScheduleSilently(newData);
            }
        } catch (error) {
            document.getElementById('status-message').textContent = 'Error de red.';
        }
    };

    const handleNoSchedule = () => {
        document.getElementById('status-message').textContent = 'Sin datos para hoy.';
        document.getElementById('status-message').style.display = 'block';
        document.getElementById('horario-wrapper').style.display = 'none';
    };

    const updateScheduleSilently = (newData) => {
        datosCompletosDelHorario = newData;
        datosCompletosDelHorario.horarios.sort(sortHorarios);
        renderCurrentView();
    };

    const renderCurrentView = () => {
        if (!datosCompletosDelHorario?.found) return;
        const { croupiersEnTabla, horarios, datosRelevos, croupierColors } = datosCompletosDelHorario;
        const container = document.getElementById('horario-container');
        container.innerHTML = '';

        const croupiersFiltrados = croupiersEnTabla.filter(c =>
            c.toLowerCase().includes(filtroBusqueda.toLowerCase())
        );

        const horariosVisibles = horarios.slice(indiceActual, indiceActual + COLUMNAS_VISIBLES);
        const table = document.createElement('table');
        table.className = 'tabla';

        let headerContent = '<thead><tr><th>Nombre</th>';
        horariosVisibles.forEach(hora => { headerContent += `<th>${hora}</th>`; });
        headerContent += '</tr></thead>';
        table.innerHTML = headerContent;

        const tbody = document.createElement('tbody');
        croupiersFiltrados.forEach(croupier => {
            const tr = document.createElement('tr');
            const croupierId = croupier.replace(/\s+/g, '-');
            tr.id = `row-${croupierId}`;

            const td = document.createElement('td');
            td.innerHTML = `<div class="croupier-name-cell">${croupier}</div><span class="croupier-timer" id="timer-${croupierId}">00:00:00</span>`;
            if (croupierColors?.[croupier]) td.style.borderLeft = `4px solid ${croupierColors[croupier]}`;
            tr.appendChild(td);

            horariosVisibles.forEach(hora => {
                const cell = document.createElement('td');
                const data = datosRelevos[croupier]?.[hora];
                if (data) cell.appendChild(crearTarjetaRelevoVista(data));
                tr.appendChild(cell);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        container.appendChild(table);
        actualizarNavegacion();
    };

    const actualizarNavegacion = () => {
        const total = datosCompletosDelHorario.horarios.length;
        const fin = Math.min(indiceActual + COLUMNAS_VISIBLES, total);
        document.getElementById('btn-prev').disabled = indiceActual === 0;
        document.getElementById('btn-next').disabled = fin >= total;
        document.getElementById('info-horarios').textContent = `${indiceActual + 1}-${fin} de ${total}`;
    };

    function actualizarSistema() {
        if (!datosCompletosDelHorario?.found) return;
        const now = new Date();
        const { croupiersEnTabla, horarios, datosRelevos, cronometroStartTime, horasSalida } = datosCompletosDelHorario;
        const fechaVisible = new Date(fechaSelector.value + 'T00:00:00');
        const sortedHorarios = [...horarios].sort(sortHorarios);

        const horariosDate = sortedHorarios.map(h => {
            const [hour, minute] = h.split(':');
            const date = new Date(fechaVisible);
            date.setHours(hour, minute, 0, 0);
            if (parseInt(hour, 10) < 6) date.setDate(date.getDate() + 1);
            return date;
        });

        let currentScheduleIndex = -1;
        for (let i = horariosDate.length - 1; i >= 0; i--) {
            if (now >= horariosDate[i]) { currentScheduleIndex = i; break; }
        }

        if (isAutoScrolling && currentScheduleIndex > 0) {
            const newIndice = Math.max(0, currentScheduleIndex - 1);
            if (newIndice !== indiceActual) { indiceActual = newIndice; renderCurrentView(); }
        }

        croupiersEnTabla.forEach(croupier => {
            const croupierId = croupier.replace(/\s+/g, '-');
            const tdElement = document.querySelector(`#timer-${croupierId}`)?.closest('td');
            const rowElement = document.getElementById(`row-${croupierId}`);
            const isManual = cronometroStartTime?.hasOwnProperty(croupier);
            const isRunning = cronometroIntervals.hasOwnProperty(croupier);

            if (isManual) {
                if (!isRunning) iniciarCronometro(croupier, cronometroStartTime[croupier]);
                if (tdElement) tdElement.classList.add('timer-active');
            } else {
                let lastActivity = null, lastActivityTime = null;
                for (let i = currentScheduleIndex; i >= 0; i--) {
                    const activity = datosRelevos[croupier]?.[sortedHorarios[i]];
                    if (activity) { lastActivity = activity; lastActivityTime = horariosDate[i].getTime(); break; }
                }
                if (lastActivity && (lastActivity.actividad === 'releva' || lastActivity.actividad === 'ayudante-pagador')) {
                    if (!isRunning) iniciarCronometro(croupier, lastActivityTime);
                    if (tdElement) tdElement.classList.add('timer-active');
                } else {
                    detenerCronometro(croupier, true);
                    if (tdElement) tdElement.classList.remove('timer-active');
                }
            }

            const salidaTime = horasSalida?.[croupier];
            if (salidaTime && rowElement) {
                const [h, m] = salidaTime.split(':').map(Number);
                const sDate = new Date(fechaVisible);
                sDate.setHours(h, m, 0, 0);
                if (h < 6) sDate.setDate(sDate.getDate() + 1);
                const diff = (sDate.getTime() - now.getTime()) / 60000;
                rowElement.classList.toggle('salida-warning', diff > 0 && diff <= 20);
            }
        });
    }

    function iniciarCronometro(croupier, startTime) {
        if (cronometroIntervals[croupier]) return;
        cronometroIntervals[croupier] = setInterval(() => {
            const elapsed = new Date().getTime() - startTime;
            actualizarDisplayCrono(croupier, new Date(elapsed).toISOString().slice(11, 19));
        }, 1000);
    }

    function detenerCronometro(croupier, reset = false) {
        if (cronometroIntervals[croupier]) {
            clearInterval(cronometroIntervals[croupier]);
            delete cronometroIntervals[croupier];
        }
        if (reset) actualizarDisplayCrono(croupier, '00:00:00');
    }

    function actualizarDisplayCrono(croupier, tiempo) {
        const timerEl = document.getElementById(`timer-${croupier.replace(/\s+/g, '-')}`);
        if (timerEl) timerEl.textContent = tiempo;
    }

    /* Inicialización */
    const savedDate = localStorage.getItem('lastDate');
    const defaultDate = new URLSearchParams(window.location.search).get('fecha') || savedDate || getLocalDateString(new Date());
    fechaSelector.value = defaultDate;
    loadSchedule(defaultDate, true);

    fechaSelector.addEventListener('change', () => {
        localStorage.setItem('lastDate', fechaSelector.value);
        loadSchedule(fechaSelector.value, true);
    });

    busquedaInput.addEventListener('input', (e) => {
        filtroBusqueda = e.target.value;
        renderCurrentView();
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        isAutoScrolling = false;
        if (indiceActual + COLUMNAS_VISIBLES < datosCompletosDelHorario.horarios.length) {
            indiceActual += COLUMNAS_VISIBLES;
            renderCurrentView();
        }
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
        isAutoScrolling = false;
        if (indiceActual > 0) {
            indiceActual = Math.max(0, indiceActual - COLUMNAS_VISIBLES);
            renderCurrentView();
        }
    });
});
