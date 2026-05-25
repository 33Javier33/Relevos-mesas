/* Lógica del Visualizador de Turno (vista/index.html) */
/* Depende de: js/shared.js (sortHorarios, crearTarjetaRelevo) */

document.addEventListener('DOMContentLoaded', () => {
    const SCRIPT_URL_HORARIOS = 'https://script.google.com/macros/s/AKfycbzPFN3DsRlqRg7kFlug6NGK7X7ufMbLZzn8XCUR7GCCr4Ft3UTcUhs11fYlkWTld83N/exec';

    const DOM = {
        thead: document.getElementById('tabla-horario-actual').querySelector('thead'),
        tbody: document.getElementById('tabla-horario-actual').querySelector('tbody'),
        relojDigital: document.getElementById('reloj-digital'),
        fechaDisplay: document.getElementById('fecha-actual'),
    };

    let cronosCongelados = {};

    async function fetchHorarioFromSheets() {
        DOM.tbody.innerHTML = '<tr><td colspan="4">Cargando datos desde la nube... ☁️</td></tr>';
        const diaString = new Date().toISOString().split('T')[0];
        const url = `${SCRIPT_URL_HORARIOS}?action=getHorario&dia=${diaString}`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error de red: ${response.statusText}`);
            const result = await response.json();
            if (result.status === 'success') {
                if (result.message === 'No data') {
                    localStorage.removeItem('croupiersData');
                    localStorage.removeItem('horarios');
                    localStorage.removeItem('datosRelevos');
                } else {
                    localStorage.setItem('datosRelevos', JSON.stringify(result.data.relevos || {}));
                    localStorage.setItem('croupiersData', JSON.stringify(result.data.croupiers || []));
                    localStorage.setItem('horarios', JSON.stringify(result.data.horarios || []));
                }
            } else {
                throw new Error(result.message || 'Error desconocido al obtener los datos.');
            }
        } catch (error) {
            console.error('Error al obtener horario:', error);
            DOM.tbody.innerHTML = `<tr><td colspan="4">Error al cargar: ${error.message}</td></tr>`;
        } finally {
            renderizarVistaActual();
        }
    }

    function actualizarRelojYFecha() {
        const now = new Date();
        DOM.relojDigital.textContent = now.toTimeString().slice(0, 8);
        DOM.fechaDisplay.textContent = now.toLocaleString('es-ES', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    function actualizarCronometrosVisibles() {
        const cronometroState = JSON.parse(localStorage.getItem('cronometroState')) || {};
        const displays = document.querySelectorAll('.crono-display-vista');
        const TIEMPO_GRACIA_MS = 2 * 60 * 1000;

        displays.forEach(display => {
            const croupierNombre = display.dataset.cronoCroupier;
            const startTime = cronometroState[croupierNombre];

            if (startTime) {
                const elapsed = new Date().getTime() - startTime;
                const formattedTime = new Date(elapsed).toISOString().slice(11, 19);
                display.innerHTML = `⏳ <span class="crono-timer">${formattedTime}</span>`;
                display.classList.add('running');
                display.style.display = 'flex';
                cronosCongelados[croupierNombre] = { tiempo: formattedTime, timestamp: Date.now() };
            } else if (cronosCongelados[croupierNombre]) {
                const ahora = Date.now();
                const tiempoGuardado = cronosCongelados[croupierNombre];
                if (ahora - tiempoGuardado.timestamp < TIEMPO_GRACIA_MS) {
                    display.innerHTML = `⏸️ <span class="crono-timer">${tiempoGuardado.tiempo}</span>`;
                    display.classList.remove('running');
                    display.style.display = 'flex';
                } else {
                    delete cronosCongelados[croupierNombre];
                    display.style.display = 'none';
                }
            } else {
                display.style.display = 'none';
            }
        });
    }

    function determinarHorariosVisibles(horarios) {
        const ahora = new Date();
        const retrasoEnMs = 2 * 60 * 1000;
        const tiempoDeComparacion = ahora.getTime() - retrasoEnMs;
        const horariosOrdenados = [...horarios].sort(sortHorarios);
        let indiceActual = -1;

        for (let i = 0; i < horariosOrdenados.length; i++) {
            const [h, m] = horariosOrdenados[i].split(':').map(Number);
            const fechaHorario = new Date();
            fechaHorario.setHours(h, m, 0, 0);
            if (h < 6 && ahora.getHours() > 18) {
                fechaHorario.setDate(fechaHorario.getDate() + 1);
            }
            if (fechaHorario.getTime() <= tiempoDeComparacion) {
                indiceActual = i;
            }
        }

        if (indiceActual === -1 && horariosOrdenados.length > 0) indiceActual = 0;
        return indiceActual !== -1 ? horariosOrdenados.slice(indiceActual, indiceActual + 3) : [];
    }

    function renderizarVistaActual() {
        const croupiersData = JSON.parse(localStorage.getItem('croupiersData')) || [];
        const horarios = JSON.parse(localStorage.getItem('horarios')) || [];
        const datosRelevos = JSON.parse(localStorage.getItem('datosRelevos')) || {};
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.classList.toggle('dark-mode', savedTheme === 'dark');

        if (croupiersData.length === 0 || horarios.length === 0) {
            DOM.tbody.innerHTML = '<tr><td colspan="4">No hay datos de horario para el día de hoy.</td></tr>';
            DOM.thead.innerHTML = '';
            return;
        }

        const horariosVisibles = determinarHorariosVisibles(horarios);

        DOM.thead.innerHTML = '';
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<th>Croupier</th>';
        horariosVisibles.forEach((hora, index) => {
            const th = document.createElement('th');
            th.textContent = hora;
            if (index === 0) th.classList.add('current-time');
            headerRow.appendChild(th);
        });
        DOM.thead.appendChild(headerRow);

        DOM.tbody.innerHTML = '';
        croupiersData.forEach(croupier => {
            const tr = document.createElement('tr');
            const tdNombre = document.createElement('td');
            tdNombre.innerHTML = `
                <div class="croupier-cell-content">
                    <span>${croupier.nombreCompleto}</span>
                    <div class="crono-display-vista" data-crono-croupier="${croupier.nombreCompleto}" style="display: none;"></div>
                </div>`;
            tr.appendChild(tdNombre);

            horariosVisibles.forEach((hora, index) => {
                const td = document.createElement('td');
                if (index === 0) td.classList.add('current-time');
                const relevoData = datosRelevos[croupier.nombreCompleto]?.[hora];
                td.appendChild(crearTarjetaRelevo(relevoData));
                tr.appendChild(td);
            });
            DOM.tbody.appendChild(tr);
        });

        actualizarCronometrosVisibles();
    }

    function inicializar() {
        actualizarRelojYFecha();
        fetchHorarioFromSheets();
        setInterval(actualizarRelojYFecha, 1000);
        setInterval(actualizarCronometrosVisibles, 1000);
        setInterval(fetchHorarioFromSheets, 30000);
        window.addEventListener('storage', renderizarVistaActual);
    }

    inicializar();
});
