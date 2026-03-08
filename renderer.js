let apps = [];

let activeAppId = null;

const appListEl = document.getElementById('app-list');
const addAppBtn = document.getElementById('add-app-btn');
const modal = document.getElementById('add-app-modal');
const cancelAddBtn = document.getElementById('cancel-add-btn');
const addAppForm = document.getElementById('add-app-form');
const welcomeScreen = document.getElementById('welcome-screen');

let draggedItemIndex = null;

function renderApps() {
    appListEl.innerHTML = '';

    apps.forEach((app, index) => {
        const li = document.createElement('li');
        li.className = `app-item ${app.id === activeAppId ? 'active' : ''}`;
        li.title = app.name;
        li.dataset.id = app.id;
        li.draggable = true;

        let iconHtml = '';
        if (app.icon) {
            iconHtml = `<img src="${app.icon}" alt="${app.name}" onerror="this.outerHTML='<div class=\\'initial\\'>${app.name.charAt(0).toUpperCase()}</div>'">`;
        } else {
            iconHtml = `<div class="initial">${app.name.charAt(0).toUpperCase()}</div>`;
        }

        li.innerHTML = `
            ${iconHtml}
            <button class="remove-btn" title="Remove App" data-id="${app.id}">×</button>
        `;

        li.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) return;
            switchApp(app.id);
        });

        li.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeApp(app.id);
        });

        // Right-click to edit
        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openEditModal(app);
        });

        // Drag and Drop Events
        li.addEventListener('dragstart', (e) => {
            draggedItemIndex = index;
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
            document.querySelectorAll('.app-item').forEach(el => el.classList.remove('drag-over'));
            draggedItemIndex = null;
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault(); // allow drop
            e.dataTransfer.dropEffect = 'move';
        });

        li.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (draggedItemIndex !== null && draggedItemIndex !== index) {
                li.classList.add('drag-over');
            }
        });

        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-over');
        });

        li.addEventListener('drop', (e) => {
            e.preventDefault();
            li.classList.remove('drag-over');

            if (draggedItemIndex === null || draggedItemIndex === index) return;

            // Reorder array
            const draggedApp = apps.splice(draggedItemIndex, 1)[0];
            apps.splice(index, 0, draggedApp);

            // Save and re-render
            if (window.electronAPI) window.electronAPI.saveApps(apps);
            renderApps();
        });

        appListEl.appendChild(li);
    });
}

function switchApp(id) {
    if (activeAppId === id) return;

    activeAppId = id;
    renderApps(); // Update active class

    // Hide welcome screen
    welcomeScreen.style.display = 'none';

    const app = apps.find(a => a.id === id);
    if (app && window.electronAPI) {
        window.electronAPI.switchApp({ id: app.id, url: app.url });
    }
}

function removeApp(id) {
    apps = apps.filter(a => a.id !== id);
    if (activeAppId === id) {
        activeAppId = null;
        welcomeScreen.style.display = 'flex';
    }
    renderApps();

    if (window.electronAPI) {
        window.electronAPI.saveApps(apps);
        window.electronAPI.removeApp(id);
    }
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function openEditModal(app) {
    document.getElementById('modal-title').textContent = 'Edit Web App';
    document.getElementById('app-id').value = app.id;
    document.getElementById('app-name').value = app.name;
    document.getElementById('app-url').value = app.url;
    document.getElementById('app-icon').value = app.icon || '';

    modal.classList.remove('hidden');
    document.getElementById('app-name').focus();
    if (window.electronAPI) window.electronAPI.hideActiveApp();
}

// Modal handling
addAppBtn.addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Add Web App';
    document.getElementById('app-id').value = '';

    modal.classList.remove('hidden');
    document.getElementById('app-name').focus();
    if (window.electronAPI) window.electronAPI.hideActiveApp();
});

cancelAddBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    addAppForm.reset();
    if (window.electronAPI) window.electronAPI.showActiveApp();
});

addAppForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('app-id').value;
    const name = document.getElementById('app-name').value;
    let url = document.getElementById('app-url').value;
    const icon = document.getElementById('app-icon').value;

    // Auto-formatting URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    if (id) {
        // Editing existing app
        const appIndex = apps.findIndex(a => a.id === id);
        if (appIndex !== -1) {
            apps[appIndex] = { ...apps[appIndex], name, url, icon: icon || null };
        }

        // If editing the active app, we might need to refresh it, but for now just update UI
        if (activeAppId === id && window.electronAPI) {
            window.electronAPI.switchApp({ id, url }); // will reload the URL
        }
    } else {
        // Adding new app
        const newApp = {
            id: generateId(),
            name,
            url,
            icon: icon || null
        };
        apps.push(newApp);
        switchApp(newApp.id);
    }
    renderApps();

    if (window.electronAPI) {
        window.electronAPI.saveApps(apps);
    }

    modal.classList.add('hidden');
    addAppForm.reset();
});

// Close modal when clicking outside
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.add('hidden');
        addAppForm.reset();
        if (window.electronAPI) window.electronAPI.showActiveApp();
    }
});

// Initial load
async function init() {
    if (window.electronAPI) {
        apps = await window.electronAPI.getApps();
    }
    renderApps();
}

init();
