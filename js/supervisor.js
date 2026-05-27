/* Lógica de la vista de Supervisor */

(function () {
    const GAS_HORARIOS  = 'https://script.google.com/macros/s/AKfycbw1kBHYt37_X5K7UdBZlJNTgNT2B2P0t4F6uVrCKK_hDgZ7j09cwSzNx5l9CvHwFCTDQg/exec';
    const GAS_MAESTROS  = 'https://script.google.com/macros/s/AKfycbzjaL7OKe1_doagry1eo0w15vXOJy_-oEtWreLTzj1GoQgxyE8cDI7jTgWm7qqThB7M/exec';

    let fechaActual = null;
    let scheduleData = null;
    let mesasDisponibles = [];
    let solicitudesPrevRespondidas = -1;

    // ── Auth ──────────────────────────────────────────────────
    function checkAuth() {
        const role = localStorage.getItem('userRole');
        if (!role) { window.location.href = 'login.html'; return false; }
        if (role !== 'supervisor') { window.location.href = 'index.html'; return false; }
        return true;
    }

    function logout() {
        localStorage.removeItem('userRole');
        localStorage.removeItem('loginTime');
        window.location.href = 'login.html';
    }

    // ── Fecha ─────────────────────────────────────────────────
    function getFechaApertura() {
        const now = new Date();
        if (now.getHours() < 6) {
            const ayer = new Date(now);
            ayer.setDate(ayer.getDate() - 1);
            return ayer;
        }
        return now;
    }

    function getLocalStr(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function formatFecha(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function cambiarDia(delta) {
        const [y, m, d] = fechaActual.split('-').map(Number);
        const nueva = new Date(y, m - 1, d + delta);
        fechaActual = getLocalStr(nueva);
        solicitudesPrevRespondidas = -1;
        cargarHorario(false);
    }

    // ── Hora de última actualización ──────────────────────────
    function mostrarHoraActualizacion() {
        const el = document.getElementById('sv-sync-status');
        if (el) el.textContent = 'Act: ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }

    // ── Toast ─────────────────────────────────────────────────
    function mostrarToast(msg, color = '#27ae60') {
        let container = document.getElementById('sv-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sv-toast-container';
            Object.assign(container.style, {
                position: 'fixed', bottom: '90px', left: '50%',
                transform: 'translateX(-50%)', zIndex: '9999',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '8px', pointerEvents: 'none'
            });
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        Object.assign(toast.style, {
            background: '#1a252f', color: '#fff', padding: '12px 20px',
            borderRadius: '10px', fontSize: '0.88em', fontWeight: '600',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            borderLeft: `4px solid ${color}`, maxWidth: '310px',
            textAlign: 'center', transition: 'opacity 0.35s'
        });
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 350); }, 4200);
    }

    // ── Carga del horario ─────────────────────────────────────
    async function cargarHorario(mostrarSpinner = true) {
        document.getElementById('sv-fecha-display').textContent = formatFecha(fechaActual);
        document.getElementById('sv-solicitud-fecha-label').textContent = 'Turno: ' + formatFecha(fechaActual);

        const container = document.getElementById('sv-schedule-container');
        if (mostrarSpinner) container.innerHTML = '<div class="sv-status-msg">Cargando…</div>';

        try {
            const res  = await fetch(`${GAS_HORARIOS}?action=load&fecha=${fechaActual}&t=${Date.now()}`);
            const data = await res.json();
            scheduleData = data.found ? data : null;
            renderizarTabla(data);
            poblarSelectores(data);
            mostrarHoraActualizacion();
            cargarContadorSolicitudes();
        } catch {
            if (mostrarSpinner) {
                container.innerHTML = '<div class="sv-status-msg sv-status-error">Error al cargar el horario.</div>';
            }
        }
    }

    function renderizarTabla(data) {
        const container = document.getElementById('sv-schedule-container');
        if (!data.found || !data.horarios?.length || !data.croupiersEnTabla?.length) {
            container.innerHTML = '<div class="sv-status-msg">Sin datos para este turno.</div>';
            return;
        }

        const sorted = [...data.horarios].sort(sortHorarios);
        const table = document.createElement('table');
        table.className = 'sv-tabla';

        // Thead
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const thNombre = document.createElement('th');
        thNombre.className = 'sv-th-croupier';
        thNombre.textContent = 'Croupier';
        headerRow.appendChild(thNombre);
        sorted.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headerRow.appendChild(th);
        });

        // Tbody
        const tbody = table.createTBody();
        data.croupiersEnTabla.forEach(nombre => {
            const tr = tbody.insertRow();
            const tdNombre = tr.insertCell();
            tdNombre.className = 'sv-td-croupier';
            const salida = data.horasSalida?.[nombre] || data.croupierSalidas?.[nombre] || '';
            tdNombre.innerHTML = `<strong>${generarAlias(nombre)}</strong>${salida ? `<br><span class="sv-salida">${salida}</span>` : ''}`;

            sorted.forEach(hora => {
                const td = tr.insertCell();
                td.className = 'sv-td-relevo';
                const entry = data.datosRelevos?.[nombre]?.[hora];
                if (entry) td.appendChild(crearTarjetaRelevo(entry));
            });
        });

        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'sv-tabla-wrapper';
        wrapper.appendChild(table);
        container.appendChild(wrapper);
    }

    // ── Selectores del formulario ─────────────────────────────
    async function poblarSelectores(data) {
        const selCroupier = document.getElementById('sv-croupier');
        selCroupier.innerHTML = '<option value="">— Sin especificar —</option>';
        (data.croupiersEnTabla || []).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            selCroupier.appendChild(opt);
        });

        const selMesa = document.getElementById('sv-mesa');
        selMesa.innerHTML = '<option value="">— Sin especificar —</option>';

        let mesas = [];
        if (data.mesasHabilitadas?.length) {
            mesas = [...data.mesasHabilitadas];
        } else if (data.datosRelevos) {
            const set = new Set();
            Object.values(data.datosRelevos).forEach(porHora => {
                Object.values(porHora).forEach(entry => {
                    if (entry.mesas) entry.mesas.forEach(m => set.add(m));
                });
            });
            mesas = [...set].sort();
        }

        if (!mesas.length) {
            mesas = mesasDisponibles;
            if (!mesas.length) {
                try {
                    const res = await fetch(`${GAS_MAESTROS}?t=${Date.now()}`);
                    const maestros = await res.json();
                    mesas = maestros.mesas || [];
                    mesasDisponibles = mesas;
                } catch { /* sin mesas */ }
            }
        }

        mesas.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m; opt.textContent = m;
            selMesa.appendChild(opt);
        });
    }

    // ── Solicitudes ───────────────────────────────────────────
    async function cargarContadorSolicitudes() {
        try {
            const res  = await fetch(`${GAS_HORARIOS}?action=solicitudes&fecha=${fechaActual}&t=${Date.now()}`);
            const data = await res.json();
            const todas       = data.solicitudes || [];
            const pendientes  = todas.filter(s => s.estado === 'pendiente').length;
            const respondidas = todas.filter(s => s.estado !== 'pendiente').length;

            const badge = document.getElementById('sv-badge');
            badge.textContent = pendientes;
            badge.style.display = pendientes > 0 ? 'inline-flex' : 'none';

            // Notificar al supervisor cuando el operador respondió
            if (solicitudesPrevRespondidas >= 0 && respondidas > solicitudesPrevRespondidas) {
                const n = respondidas - solicitudesPrevRespondidas;
                mostrarToast(n === 1 ? '✅ El operador respondió tu solicitud' : `✅ El operador respondió ${n} solicitudes`);
            }
            solicitudesPrevRespondidas = respondidas;
        } catch { /* silencioso */ }
    }

    async function cargarYMostrarSolicitudes() {
        document.getElementById('sv-lista-modal').style.display = 'flex';
        const container = document.getElementById('sv-lista-container');
        container.innerHTML = '<p style="color:var(--text-secondary-color);text-align:center;padding:20px 0">Cargando…</p>';

        try {
            const res  = await fetch(`${GAS_HORARIOS}?action=solicitudes&fecha=${fechaActual}&t=${Date.now()}`);
            const data = await res.json();
            renderizarListaSolicitudes(data.solicitudes || [], container);
        } catch {
            container.innerHTML = '<p style="color:var(--danger-color);text-align:center">Error al cargar.</p>';
        }
    }

    function renderizarListaSolicitudes(lista, container) {
        if (!lista.length) {
            container.innerHTML = '<p style="color:var(--text-secondary-color);text-align:center;padding:20px 0">No hay solicitudes para este turno.</p>';
            return;
        }

        const ESTADO_INFO = {
            pendiente:  { icon: '🟡', label: 'Pendiente',  cls: 'sv-estado-pendiente' },
            aprobado:   { icon: '✅', label: 'Aprobado',   cls: 'sv-estado-aprobado'  },
            rechazado:  { icon: '❌', label: 'Rechazado',  cls: 'sv-estado-rechazado' },
        };

        container.innerHTML = lista.map(s => {
            const est = ESTADO_INFO[s.estado] || ESTADO_INFO.pendiente;
            return `<div class="sv-solicitud-card">
                <div class="sv-sol-header">
                    <span class="sv-sol-tipo">${s.tipo || 'Solicitud'}</span>
                    <span class="sv-sol-estado ${est.cls}">${est.icon} ${est.label}</span>
                </div>
                ${s.mesa     ? `<div class="sv-sol-row"><b>Mesa:</b> ${s.mesa}</div>` : ''}
                ${s.croupier ? `<div class="sv-sol-row"><b>Croupier:</b> ${s.croupier}</div>` : ''}
                <div class="sv-sol-desc">${s.descripcion}</div>
                ${s.respuesta ? `<div class="sv-sol-respuesta">💬 ${s.respuesta}</div>` : ''}
                <div class="sv-sol-meta">${s.supervisor} — ${new Date(s.fecha).toLocaleString('es-ES', {dateStyle:'short', timeStyle:'short'})}</div>
            </div>`;
        }).join('');
    }

    async function enviarSolicitud() {
        const tipo        = document.getElementById('sv-tipo').value;
        const mesa        = document.getElementById('sv-mesa').value;
        const croupier    = document.getElementById('sv-croupier').value;
        const descripcion = document.getElementById('sv-descripcion').value.trim();

        if (!descripcion) { alert('La descripción es obligatoria.'); return; }

        const btn = document.getElementById('sv-btn-enviar-solicitud');
        btn.disabled = true;
        btn.textContent = 'Enviando…';

        try {
            const res = await fetch(GAS_HORARIOS, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'solicitud',
                    fechaTurno: fechaActual,
                    supervisor: localStorage.getItem('supervisorNombre') || 'Supervisor',
                    tipo, mesa, croupier, descripcion
                })
            });
            const data = await res.json();

            if (data.success) {
                document.getElementById('sv-descripcion').value = '';
                document.getElementById('sv-mesa').value = '';
                document.getElementById('sv-croupier').value = '';
                document.getElementById('sv-solicitud-modal').style.display = 'none';
                cargarContadorSolicitudes();
                mostrarToast('✉️ Solicitud enviada al operador', '#3498db');
            } else {
                alert('Error: ' + (data.error || 'No se pudo enviar.'));
            }
        } catch {
            alert('Error de conexión. Intentá de nuevo.');
        }

        btn.disabled = false;
        btn.textContent = 'Enviar Solicitud';
    }

    // ── Init ──────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        if (!checkAuth()) return;

        // Siempre arrancar en la fecha de apertura del casino (igual que el operador)
        fechaActual = getLocalStr(getFechaApertura());

        cargarHorario(true);

        // Auto-refresh del horario cada 30s (para ver cambios del operador en tiempo real)
        setInterval(() => cargarHorario(false), 30000);

        // Polling de solicitudes cada 5s
        setInterval(cargarContadorSolicitudes, 5000);

        document.getElementById('sv-btn-logout').addEventListener('click', logout);
        document.getElementById('sv-prev-day').addEventListener('click', () => cambiarDia(-1));
        document.getElementById('sv-next-day').addEventListener('click', () => cambiarDia(1));

        document.getElementById('sv-btn-nueva-solicitud').addEventListener('click', () => {
            document.getElementById('sv-solicitud-modal').style.display = 'flex';
        });
        document.getElementById('sv-btn-ver-solicitudes').addEventListener('click', cargarYMostrarSolicitudes);
        document.getElementById('sv-btn-enviar-solicitud').addEventListener('click', enviarSolicitud);

        document.getElementById('sv-close-solicitud').addEventListener('click', () => {
            document.getElementById('sv-solicitud-modal').style.display = 'none';
        });
        document.getElementById('sv-close-lista').addEventListener('click', () => {
            document.getElementById('sv-lista-modal').style.display = 'none';
        });

        [document.getElementById('sv-solicitud-modal'), document.getElementById('sv-lista-modal')].forEach(modal => {
            modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
        });
    });
})();


    // ── Auth ──────────────────────────────────────────────────
    function checkAuth() {
        const role = localStorage.getItem('userRole');
        if (!role) { window.location.href = 'login.html'; return false; }
        if (role !== 'supervisor') { window.location.href = 'index.html'; return false; }
        return true;
    }

    function logout() {
        localStorage.removeItem('userRole');
        localStorage.removeItem('loginTime');
        window.location.href = 'login.html';
    }

    // ── Fecha ─────────────────────────────────────────────────
    function getFechaApertura() {
        const now = new Date();
        if (now.getHours() < 6) {
            const ayer = new Date(now);
            ayer.setDate(ayer.getDate() - 1);
            return ayer;
        }
        return now;
    }

    function getLocalStr(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function formatFecha(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function cambiarDia(delta) {
        const [y, m, d] = fechaActual.split('-').map(Number);
        const nueva = new Date(y, m - 1, d + delta);
        fechaActual = getLocalStr(nueva);
        sessionStorage.setItem('supervisorFecha', fechaActual);
        cargarHorario();
    }

    // ── Carga del horario ─────────────────────────────────────
    async function cargarHorario() {
        document.getElementById('sv-fecha-display').textContent = formatFecha(fechaActual);
        document.getElementById('sv-solicitud-fecha-label').textContent = 'Turno: ' + formatFecha(fechaActual);

        const container = document.getElementById('sv-schedule-container');
        container.innerHTML = '<div class="sv-status-msg">Cargando…</div>';

        try {
            const res  = await fetch(`${GAS_HORARIOS}?action=load&fecha=${fechaActual}&t=${Date.now()}`);
            const data = await res.json();
            scheduleData = data.found ? data : null;
            renderizarTabla(data);
            poblarSelectores(data);
            cargarContadorSolicitudes();
        } catch {
            container.innerHTML = '<div class="sv-status-msg sv-status-error">Error al cargar el horario.</div>';
        }
    }

    function renderizarTabla(data) {
        const container = document.getElementById('sv-schedule-container');
        if (!data.found || !data.horarios?.length || !data.croupiersEnTabla?.length) {
            container.innerHTML = '<div class="sv-status-msg">Sin datos para este turno.</div>';
            return;
        }

        const sorted = [...data.horarios].sort(sortHorarios);
        const table = document.createElement('table');
        table.className = 'sv-tabla';

        // Thead
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const thNombre = document.createElement('th');
        thNombre.className = 'sv-th-croupier';
        thNombre.textContent = 'Croupier';
        headerRow.appendChild(thNombre);
        sorted.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headerRow.appendChild(th);
        });

        // Tbody
        const tbody = table.createTBody();
        data.croupiersEnTabla.forEach(nombre => {
            const tr = tbody.insertRow();
            // Nombre
            const tdNombre = tr.insertCell();
            tdNombre.className = 'sv-td-croupier';
            const salida = data.horasSalida?.[nombre] || data.croupierSalidas?.[nombre] || '';
            tdNombre.innerHTML = `<strong>${generarAlias(nombre)}</strong>${salida ? `<br><span class="sv-salida">${salida}</span>` : ''}`;

            // Celdas de horario
            sorted.forEach(hora => {
                const td = tr.insertCell();
                td.className = 'sv-td-relevo';
                const entry = data.datosRelevos?.[nombre]?.[hora];
                if (entry) td.appendChild(crearTarjetaRelevo(entry));
            });
        });

        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'sv-tabla-wrapper';
        wrapper.appendChild(table);
        container.appendChild(wrapper);
    }

    // ── Selectores del formulario ─────────────────────────────
    async function poblarSelectores(data) {
        // Croupiers desde el horario cargado
        const selCroupier = document.getElementById('sv-croupier');
        selCroupier.innerHTML = '<option value="">— Sin especificar —</option>';
        (data.croupiersEnTabla || []).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            selCroupier.appendChild(opt);
        });

        // Mesas: 1° mesasHabilitadas del turno, 2° mesas en uso en datosRelevos, 3° maestros
        const selMesa = document.getElementById('sv-mesa');
        selMesa.innerHTML = '<option value="">— Sin especificar —</option>';

        let mesas = [];

        if (data.mesasHabilitadas?.length) {
            mesas = [...data.mesasHabilitadas];
        } else if (data.datosRelevos) {
            const set = new Set();
            Object.values(data.datosRelevos).forEach(porHora => {
                Object.values(porHora).forEach(entry => {
                    if (entry.mesas) entry.mesas.forEach(m => set.add(m));
                });
            });
            mesas = [...set].sort();
        }

        if (!mesas.length) {
            mesas = mesasDisponibles;
            if (!mesas.length) {
                try {
                    const res = await fetch(`${GAS_MAESTROS}?t=${Date.now()}`);
                    const maestros = await res.json();
                    mesas = maestros.mesas || [];
                    mesasDisponibles = mesas;
                } catch { /* sin mesas */ }
            }
        }

        mesas.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            selMesa.appendChild(opt);
        });
    }

    // ── Solicitudes ───────────────────────────────────────────
    async function cargarContadorSolicitudes() {
        try {
            const res  = await fetch(`${GAS_HORARIOS}?action=solicitudes&fecha=${fechaActual}&t=${Date.now()}`);
            const data = await res.json();
            const total = data.solicitudes?.length || 0;
            const badge = document.getElementById('sv-badge');
            badge.textContent = total;
            badge.style.display = total > 0 ? 'inline-flex' : 'none';
        } catch { /* silencioso */ }
    }

    async function cargarYMostrarSolicitudes() {
        document.getElementById('sv-lista-modal').style.display = 'flex';
        const container = document.getElementById('sv-lista-container');
        container.innerHTML = '<p style="color:var(--text-secondary-color);text-align:center;padding:20px 0">Cargando…</p>';

        try {
            const res  = await fetch(`${GAS_HORARIOS}?action=solicitudes&fecha=${fechaActual}&t=${Date.now()}`);
            const data = await res.json();
            renderizarListaSolicitudes(data.solicitudes || [], container);
        } catch {
            container.innerHTML = '<p style="color:var(--danger-color);text-align:center">Error al cargar.</p>';
        }
    }

    function renderizarListaSolicitudes(lista, container) {
        if (!lista.length) {
            container.innerHTML = '<p style="color:var(--text-secondary-color);text-align:center;padding:20px 0">No hay solicitudes para este turno.</p>';
            return;
        }

        const ESTADO_INFO = {
            pendiente:  { icon: '🟡', label: 'Pendiente',  cls: 'sv-estado-pendiente' },
            aprobado:   { icon: '✅', label: 'Aprobado',   cls: 'sv-estado-aprobado'  },
            rechazado:  { icon: '❌', label: 'Rechazado',  cls: 'sv-estado-rechazado' },
        };

        container.innerHTML = lista.map(s => {
            const est = ESTADO_INFO[s.estado] || ESTADO_INFO.pendiente;
            return `<div class="sv-solicitud-card">
                <div class="sv-sol-header">
                    <span class="sv-sol-tipo">${s.tipo || 'Solicitud'}</span>
                    <span class="sv-sol-estado ${est.cls}">${est.icon} ${est.label}</span>
                </div>
                ${s.mesa     ? `<div class="sv-sol-row"><b>Mesa:</b> ${s.mesa}</div>` : ''}
                ${s.croupier ? `<div class="sv-sol-row"><b>Croupier:</b> ${s.croupier}</div>` : ''}
                <div class="sv-sol-desc">${s.descripcion}</div>
                ${s.respuesta ? `<div class="sv-sol-respuesta">💬 ${s.respuesta}</div>` : ''}
                <div class="sv-sol-meta">${s.supervisor} — ${new Date(s.fecha).toLocaleString('es-ES', {dateStyle:'short', timeStyle:'short'})}</div>
            </div>`;
        }).join('');
    }

    async function enviarSolicitud() {
        const tipo        = document.getElementById('sv-tipo').value;
        const mesa        = document.getElementById('sv-mesa').value;
        const croupier    = document.getElementById('sv-croupier').value;
        const descripcion = document.getElementById('sv-descripcion').value.trim();

        if (!descripcion) {
            alert('La descripción es obligatoria.');
            return;
        }

        const btn = document.getElementById('sv-btn-enviar-solicitud');
        btn.disabled = true;
        btn.textContent = 'Enviando…';

        try {
            const res = await fetch(GAS_HORARIOS, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'solicitud',
                    fechaTurno: fechaActual,
                    supervisor: localStorage.getItem('supervisorNombre') || 'Supervisor',
                    tipo, mesa, croupier, descripcion
                })
            });
            const data = await res.json();

            if (data.success) {
                document.getElementById('sv-descripcion').value = '';
                document.getElementById('sv-mesa').value = '';
                document.getElementById('sv-croupier').value = '';
                document.getElementById('sv-solicitud-modal').style.display = 'none';
                cargarContadorSolicitudes();
                alert('✅ Solicitud enviada correctamente.');
            } else {
                alert('Error: ' + (data.error || 'No se pudo enviar.'));
            }
        } catch {
            alert('Error de conexión. Intentá de nuevo.');
        }

        btn.disabled = false;
        btn.textContent = 'Enviar Solicitud';
    }

    // ── Init ──────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        if (!checkAuth()) return;

        // Siempre arrancar en la fecha de apertura del casino (igual que el operador)
        fechaActual = getLocalStr(getFechaApertura());
        sessionStorage.setItem('supervisorFecha', fechaActual);

        cargarHorario();
        setInterval(cargarContadorSolicitudes, 5000);

        document.getElementById('sv-btn-logout').addEventListener('click', logout);
        document.getElementById('sv-prev-day').addEventListener('click', () => cambiarDia(-1));
        document.getElementById('sv-next-day').addEventListener('click', () => cambiarDia(1));

        document.getElementById('sv-btn-nueva-solicitud').addEventListener('click', () => {
            document.getElementById('sv-solicitud-modal').style.display = 'flex';
        });
        document.getElementById('sv-btn-ver-solicitudes').addEventListener('click', cargarYMostrarSolicitudes);
        document.getElementById('sv-btn-enviar-solicitud').addEventListener('click', enviarSolicitud);

        document.getElementById('sv-close-solicitud').addEventListener('click', () => {
            document.getElementById('sv-solicitud-modal').style.display = 'none';
        });
        document.getElementById('sv-close-lista').addEventListener('click', () => {
            document.getElementById('sv-lista-modal').style.display = 'none';
        });

        // Cerrar modales al hacer clic fuera
        [document.getElementById('sv-solicitud-modal'), document.getElementById('sv-lista-modal')].forEach(modal => {
            modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
        });
    });
})();
