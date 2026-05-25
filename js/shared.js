/* Utilidades compartidas entre todas las páginas */

function showModal(title, message, type = 'info', onConfirm = null) {
    document.getElementById('custom-alert-title').textContent = title;
    document.getElementById('custom-alert-message').textContent = message;
    const okBtn = document.getElementById('custom-alert-ok');
    const cancelBtn = document.getElementById('custom-alert-cancel');
    cancelBtn.style.display = type === 'confirm' ? 'inline-block' : 'none';
    okBtn.textContent = type === 'confirm' ? 'Aceptar' : 'OK';
    document.getElementById('custom-alert-modal').style.display = 'flex';
    okBtn.onclick = () => {
        document.getElementById('custom-alert-modal').style.display = 'none';
        if (onConfirm) onConfirm();
    };
    cancelBtn.onclick = () => {
        document.getElementById('custom-alert-modal').style.display = 'none';
    };
}

function sortHorarios(a, b) {
    let aHour = parseInt(a.split(':')[0], 10), bHour = parseInt(b.split(':')[0], 10);
    if (aHour < 6) aHour += 24;
    if (bHour < 6) bHour += 24;
    if (aHour < bHour) return -1;
    if (aHour > bHour) return 1;
    let aMin = parseInt(a.split(':')[1], 10), bMin = parseInt(b.split(':')[1], 10);
    return aMin - bMin;
}

function crearTarjetaRelevo(relevoData) {
    const div = document.createElement('div');
    div.className = 'relevo-cell';
    if (!relevoData) return div;
    switch (relevoData.actividad) {
        case 'releva':
            div.style.backgroundColor = relevoData.color || '#3498db';
            div.textContent = relevoData.mesas.join(' - ');
            break;
        case 'ayudante-pagador':
            div.classList.add('ayudante-pagador');
            div.textContent = 'AYUD. PAGADOR';
            break;
        case 'descanso':
            div.style.backgroundColor = '#f39c12';
            div.textContent = 'DESCANSO';
            break;
        default:
            div.style.backgroundColor = '#95a5a6';
            div.textContent = 'S/A';
    }
    return div;
}

function getLocalDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function generarAlias(nombre) {
    const partes = nombre.split(' ');
    return partes.length > 1 ? `${partes[0]} ${partes[1][0]}.` : nombre;
}
