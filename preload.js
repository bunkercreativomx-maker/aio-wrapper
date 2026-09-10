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
    onOpenedExternal: (cb) => ipcRenderer.on('opened-external', (_e, data) => cb(data)),
    // In-HTML window controls (used on non-Windows)
    windowMinimize: () => ipcRenderer.send('win-minimize'),
    windowMaximizeToggle: () => ipcRenderer.send('win-maximize-toggle'),
    windowClose: () => ipcRenderer.send('win-close')
});
