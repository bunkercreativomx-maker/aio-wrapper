const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    switchApp: (appData) => ipcRenderer.send('switch-app', appData),
    removeApp: (id) => ipcRenderer.send('remove-app', id),
    hideActiveApp: () => ipcRenderer.send('hide-active-app'),
    showActiveApp: () => ipcRenderer.send('show-active-app'),
    getApps: () => ipcRenderer.invoke('get-apps'),
    getVersion: () => ipcRenderer.invoke('get-version'),
    saveApps: (apps) => ipcRenderer.send('save-apps', apps)
});
