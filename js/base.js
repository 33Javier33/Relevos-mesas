/* Lógica del Panel de Gestión (base/index.html) */
/* Depende de: js/shared.js (showModal, getLocalDateString) */

document.addEventListener('DOMContentLoaded', () => {
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyXY0PfaitLqkVf7MmhCEPvNMoCOaWiPXZ3XtqYMxzuX8z_u5SknaLocFVpVMt_UqaR/exec';

    let croupiersEnEspera = [];
    let mesasDeJuego = [];
    let juegosMaestro = ["Poker", "Blackjack", "Ruleta", "Craps", "Mini&PuntoyBanca", "Bug-six", "Caribbean", "Draw", "Hold'em"];
    let currentContratoFilter = 'todos';
    let croupierToEdit = null;

    const DOM = {
        panelCroupiers: document.getElementById('panel-croupiers'),
        nuevoCroupierInput: document.getElementById('nuevo-croupier-input'),
        nuevoCroupierContrato: document.getElementById('nuevo-croupier-contrato'),
        juegosSelectorCroupier: document.getElementById('juegos-selector-croupier'),
        dropdownJuegos: document.getElementById('dropdown-juegos'),
        btnAgregarCroupierDB: document.getElementById('btn-agregar-croupier-db'),
        contadorRegistrados: document.getElementById('contador-croupiers-registrados'),
        croupierFilterButtons: document.getElementById('croupier-filter-buttons'),
        croupierPreTableBody: document.getElementById('croupier-pre-table').querySelector('tbody'),
        nuevaMesaInput: document.getElementById('nueva-mesa-input'),
        btnAgregarMesa: document.getElementById('btn-agregar-mesa'),
        mesasListDiv: document.getElementById('mesas-list'),
        btnToggleTheme: document.getElementById('btn-toggle-theme'),
        fileInputRestore: document.getElementById('file-input-restore'),
        btnClearHorarioOnly: document.getElementById('btn-clear-horario-only'),
        btnClearCroupiersOnly: document.getElementById('btn-clear-croupiers-only'),
        editCroupierModal: document.getElementById('edit-croupier-modal'),
        editCroupierOriginalName: document.getElementById('edit-croupier-original-name'),
        editCroupierNameInput: document.getElementById('edit-croupier-name-input'),
        editCroupierContrato: document.getElementById('edit-croupier-contrato'),
        editJuegosSelector: document.getElementById('edit-juegos-selector'),
        editDropdownJuegos: document.getElementById('edit-dropdown-juegos'),
        btnSaveEdit: document.getElementById('btn-save-edit'),
        btnCancelEdit: document.getElementById('btn-cancel-edit')
    };

    function showLoading(show) {
        DOM.panelCroupiers.querySelector('.loading-overlay').style.display = show ? 'flex' : 'none';
    }

    async function fetchMasterData() {
        showLoading(true);
        try {
            const cacheBuster = `&t=${new Date().getTime()}`;
            const [croupiersResponse, mesasResponse] = await Promise.all([
                fetch(`${SCRIPT_URL}?${cacheBuster}`),
                fetch(`${SCRIPT_URL}?dataType=mesas${cacheBuster}`)
            ]);
            if (!croupiersResponse.ok) throw new Error('Falló la carga de croupiers desde Google Sheets.');
            if (!mesasResponse.ok) throw new Error('Falló la carga de mesas desde Google Sheets.');

            croupiersEnEspera = await croupiersResponse.json();
            mesasDeJuego = await mesasResponse.json() || [];

            localStorage.setItem('croupiersEnEspera', JSON.stringify(croupiersEnEspera));
            localStorage.setItem('mesasDeJuego', JSON.stringify(mesasDeJuego));
            window.dispatchEvent(new Event('storage'));
            renderizarCroupiersPreTable(currentContratoFilter);
            renderizarMesasList();
        } catch (error) {
            showModal('Error de Conexión', `No se pudo cargar la base de datos desde Google Sheets. Error: ${error.message}`, 'info');
        } finally {
            showLoading(false);
        }
    }

    async function sendDataToSheet(payload, message) {
        showLoading(true);
        const finalizeOperation = () => {
            setTimeout(async () => {
                showModal('Verificando', `${message} Actualizando la lista para confirmar...`, 'info');
                await fetchMasterData();
            }, 2500);
        };
        try {
            fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            finalizeOperation();
        } catch (error) {
            console.warn("Error de red detectado. Se asume que la solicitud fue enviada. Verificando...", error);
            finalizeOperation();
        }
    }

    async function addCroupierToSheet() {
        const nombreCompleto = DOM.nuevoCroupierInput.value.trim();
        if (!nombreCompleto) { showModal('Error', 'El nombre es obligatorio.', 'info'); return; }
        if (croupiersEnEspera.some(c => c.nombreCompleto.toLowerCase() === nombreCompleto.toLowerCase())) {
            showModal('Error', 'Este croupier ya existe.', 'info'); return;
        }
        const nuevoCroupier = {
            nombreCompleto,
            contrato: DOM.nuevoCroupierContrato.value,
            juegosQuePaga: Array.from(DOM.dropdownJuegos.querySelectorAll('input:checked')).map(cb => cb.value)
        };
        const payload = { action: 'addCroupier', data: nuevoCroupier };
        const message = `Solicitud para agregar a ${nuevoCroupier.nombreCompleto} enviada.`;
        DOM.nuevoCroupierInput.value = '';
        DOM.dropdownJuegos.querySelectorAll('input:checked').forEach(cb => cb.checked = false);
        await sendDataToSheet(payload, message);
    }

    async function updateCroupierInSheet() {
        const nuevoNombre = DOM.editCroupierNameInput.value.trim();
        if (!nuevoNombre) { showModal('Error', 'El nombre no puede estar vacío.', 'info'); return; }
        const payload = {
            action: 'updateCroupier',
            nombreOriginal: croupierToEdit.nombreCompleto,
            data: {
                nombreCompleto: nuevoNombre,
                contrato: DOM.editCroupierContrato.value,
                juegosQuePaga: Array.from(DOM.editDropdownJuegos.querySelectorAll('input:checked')).map(cb => cb.value)
            }
        };
        DOM.editCroupierModal.style.display = 'none';
        const message = `Solicitud para actualizar a ${croupierToEdit.nombreCompleto} enviada.`;
        await sendDataToSheet(payload, message);
    }

    async function deleteCroupierFromSheet(nombre) {
        showModal('Eliminar Croupier', `¿Estás seguro de que quieres eliminar a "${nombre}" de forma permanente?`, 'confirm', async () => {
            const payload = { action: 'deleteCroupier', nombreCompleto: nombre };
            const message = `Solicitud para eliminar a "${nombre}" enviada.`;
            await sendDataToSheet(payload, message);
        });
    }

    async function saveMesasToSheet() {
        localStorage.setItem('mesasDeJuego', JSON.stringify(mesasDeJuego));
        window.dispatchEvent(new Event('storage'));
        try {
            const payload = { action: 'saveMesas', mesas: mesasDeJuego };
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            console.warn("No se pudo sincronizar la lista de mesas (error de red):", error);
            showModal('Advertencia', 'No se pudo sincronizar la lista de mesas con la nube (error de red), pero se guardó localmente.');
        }
    }

    async function restaurarBackup(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backupData = JSON.parse(e.target.result);
                if (!backupData.croupiers || !Array.isArray(backupData.croupiers)) {
                    showModal('Error', 'El archivo de respaldo no es válido o no contiene croupiers.', 'info');
                    return;
                }
                const payload = { action: 'restoreBackup', data: backupData.croupiers };
                const message = `Solicitud para restaurar respaldo enviada.`;
                await sendDataToSheet(payload, message);
            } catch (error) {
                showModal('Error al Restaurar', `No se pudo procesar el archivo. Error: ${error.message}`, 'info');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    function renderizarMesasList() {
        DOM.mesasListDiv.innerHTML = '';
        mesasDeJuego.forEach(mesa => {
            const mesaTag = document.createElement('div');
            mesaTag.className = 'mesa-tag';
            mesaTag.textContent = mesa;
            mesaTag.dataset.id = mesa;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-mesa';
            deleteBtn.textContent = '×';
            deleteBtn.addEventListener('click', () => borrarMesa(mesa));
            mesaTag.appendChild(deleteBtn);
            DOM.mesasListDiv.appendChild(mesaTag);
        });
    }

    function agregarMesa() {
        const nuevaMesa = DOM.nuevaMesaInput.value.trim().toUpperCase();
        if (nuevaMesa && !mesasDeJuego.some(m => m.toLowerCase() === nuevaMesa.toLowerCase())) {
            mesasDeJuego.push(nuevaMesa);
            DOM.nuevaMesaInput.value = '';
            renderizarMesasList();
            saveMesasToSheet();
        } else {
            showModal('Error', 'La mesa no puede estar vacía o ya existe.', 'info');
        }
    }

    function borrarMesa(mesaABorrar) {
        showModal('Eliminar Mesa', `¿Estás seguro de que quieres eliminar la mesa "${mesaABorrar}"?`, 'confirm', () => {
            mesasDeJuego = mesasDeJuego.filter(m => m !== mesaABorrar);
            renderizarMesasList();
            saveMesasToSheet();
        });
    }

    function borrarSoloHorarios() {
        showModal('Borrar Horario del Día', 'Se borrarán los datos del horario del día actual guardado en este navegador. ¿Continuar?', 'confirm', () => {
            const fechaKey = getLocalDateString(new Date());
            localStorage.removeItem(`horario_${fechaKey}`);
            localStorage.removeItem('fechaGuardada');
            window.dispatchEvent(new Event('storage'));
            showModal('Éxito', 'Los datos del horario local para hoy han sido borrados.', 'info');
        });
    }

    function borrarSoloCroupiersDeTabla() {
        showModal('Limpiar Croupiers de Tabla', 'Esto quitará a todos los croupiers de la tabla del horario actual en este navegador, pero no sus asignaciones. ¿Continuar?', 'confirm', () => {
            const key = `horario_${getLocalDateString(new Date())}`;
            const dataGuardada = localStorage.getItem(key);
            if (dataGuardada) {
                let datos = JSON.parse(dataGuardada);
                datos.croupiersEnTabla = [];
                datos.croupierColors = {};
                datos.croupierSalidas = {};
                datos.cronometroState = {};
                localStorage.setItem(key, JSON.stringify(datos));
                window.dispatchEvent(new Event('storage'));
                showModal('Éxito', 'Los croupiers de la tabla local han sido limpiados.', 'info');
            } else {
                showModal('Info', 'No se encontraron datos de horario para hoy para limpiar.', 'info');
            }
        });
    }

    function renderizarCroupiersPreTable(contratoFilter = 'todos') {
        DOM.croupierPreTableBody.innerHTML = '';
        const filteredCroupiers = croupiersEnEspera.filter(c => contratoFilter === 'todos' || c.contrato === contratoFilter);
        DOM.contadorRegistrados.textContent = filteredCroupiers.length;
        filteredCroupiers.forEach(croupier => {
            const tr = document.createElement('tr');
            const tdNombre = document.createElement('td');
            tdNombre.textContent = croupier.nombreCompleto;
            const tdContrato = document.createElement('td');
            tdContrato.textContent = croupier.contrato;
            const tdAcciones = document.createElement('td');
            tdAcciones.style.display = 'flex';
            tdAcciones.style.gap = '5px';

            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.textContent = 'Editar';
            editBtn.onclick = () => showEditModal(croupier);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-croupier-btn';
            deleteBtn.textContent = 'Eliminar';
            deleteBtn.onclick = () => deleteCroupierFromSheet(croupier.nombreCompleto);

            tdAcciones.appendChild(editBtn);
            tdAcciones.appendChild(deleteBtn);
            tr.appendChild(tdNombre);
            tr.appendChild(tdContrato);
            tr.appendChild(tdAcciones);
            DOM.croupierPreTableBody.appendChild(tr);
        });
    }

    function showEditModal(croupier) {
        croupierToEdit = croupier;
        DOM.editCroupierOriginalName.textContent = `(Original: ${croupier.nombreCompleto})`;
        DOM.editCroupierNameInput.value = croupier.nombreCompleto;
        DOM.editCroupierContrato.value = croupier.contrato;
        DOM.editDropdownJuegos.innerHTML = '';
        juegosMaestro.forEach(juego => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = juego;
            if (croupier.juegosQuePaga && croupier.juegosQuePaga.includes(juego)) {
                checkbox.checked = true;
            }
            label.appendChild(checkbox);
            label.append(` ${juego}`);
            DOM.editDropdownJuegos.appendChild(label);
        });
        DOM.editCroupierModal.style.display = 'flex';
    }

    function renderizarJuegosDropdown() {
        DOM.dropdownJuegos.innerHTML = '';
        juegosMaestro.forEach(juego => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = juego;
            label.appendChild(checkbox);
            label.append(` ${juego}`);
            DOM.dropdownJuegos.appendChild(label);
        });
    }

    async function inicializar() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.classList.toggle('dark-mode', savedTheme === 'dark');
        renderizarJuegosDropdown();
        await fetchMasterData();

        DOM.btnAgregarMesa.addEventListener('click', agregarMesa);
        new Sortable(DOM.mesasListDiv, {
            animation: 150,
            onEnd: () => {
                mesasDeJuego = Array.from(DOM.mesasListDiv.children).map(tag => tag.dataset.id);
                saveMesasToSheet();
            }
        });

        DOM.btnAgregarCroupierDB.addEventListener('click', addCroupierToSheet);
        DOM.fileInputRestore.addEventListener('change', restaurarBackup);
        DOM.btnClearHorarioOnly.addEventListener('click', borrarSoloHorarios);
        DOM.btnClearCroupiersOnly.addEventListener('click', borrarSoloCroupiersDeTabla);
        DOM.croupierFilterButtons.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                DOM.croupierFilterButtons.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                currentContratoFilter = e.target.dataset.filter;
                renderizarCroupiersPreTable(currentContratoFilter);
            }
        });

        DOM.juegosSelectorCroupier.addEventListener('click', (e) => {
            e.stopPropagation();
            DOM.juegosSelectorCroupier.classList.toggle('active');
        });
        DOM.editJuegosSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            DOM.editJuegosSelector.classList.toggle('active');
        });
        document.body.addEventListener('click', () => {
            DOM.juegosSelectorCroupier.classList.remove('active');
            DOM.editJuegosSelector.classList.remove('active');
        });

        DOM.btnSaveEdit.onclick = updateCroupierInSheet;
        DOM.btnCancelEdit.onclick = () => { DOM.editCroupierModal.style.display = 'none'; };
        DOM.btnToggleTheme.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            window.dispatchEvent(new Event('storage'));
        });
    }

    inicializar();
});
