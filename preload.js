const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    switchApp: (appData) => ipcRenderer.send('switch-app', appData),
    removeApp: (id) => ipcRenderer.send('remove-app', id),
    hideActiveApp: () => ipcRenderer.send('hide-active-app'),
    showActiveApp: () => ipcRenderer.send('show-active-app'),
    getApps: () => ipcRenderer.invoke('get-apps'),
    getVersion: () => ipcRenderer.invoke('get-version'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    saveApps: (apps) => ipcRenderer.send('save-apps', apps),
    onCycleApp: (cb) => ipcRenderer.on('cycle-app', () => cb()),
    // In-HTML window controls (used on non-Windows)
    windowMinimize: () => ipcRenderer.send('win-minimize'),
    windowMaximizeToggle: () => ipcRenderer.send('win-maximize-toggle'),
    windowClose: () => ipcRenderer.send('win-close')
});

// --- Drag & drop diagnostics (temporary) ---
// Same listeners as view-preload.js, but on the SHELL window (topbar / dock / welcome screen).
// If a file drop shows up here instead of in the web app, Chromium is routing the drop to the
// wrong WebContents; if it shows up in neither, Windows never handed the drop to us at all.
// Observation-only — never calls preventDefault.
let lastShellOver = 0;
function reportShell(kind, e) {
    let files = -1;
    let types = [];
    try {
        types = Array.from((e.dataTransfer && e.dataTransfer.types) || []);
        files = (e.dataTransfer && e.dataTransfer.files) ? e.dataTransfer.files.length : -1;
    } catch (err) { /* dataTransfer is protected outside of drop for some events */ }
    ipcRenderer.send('diag-drag', { where: 'shell', kind, types, files });
}
['dragenter', 'dragleave', 'drop'].forEach((kind) => {
    window.addEventListener(kind, (e) => reportShell(kind, e), true);
});
window.addEventListener('dragover', (e) => {
    const now = Date.now();
    if (now - lastShellOver < 1000) return;
    lastShellOver = now;
    reportShell('dragover', e);
}, true);
