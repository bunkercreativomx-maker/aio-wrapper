const { app, BrowserWindow, WebContentsView, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
let mainWindow;
let views = {};
let activeAppId = null;
let isAppHidden = false;
let tray = null;
let isQuitting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0f1115', // Matches --bg-dark (Main app body color)
            symbolColor: '#f1f2f6',
            height: 28
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');

    // Handle window resize to resize active view
    mainWindow.on('resize', () => {
        if (activeAppId && views[activeAppId]) {
            resizeView(views[activeAppId]);
        }
    });

    // Minimize to tray instead of quitting
    mainWindow.on('close', function (event) {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            event.returnValue = false;
        }
    });
}

function resizeView(view) {
    const bounds = mainWindow.getContentBounds();
    const sidebarWidth = 80; // Must match CSS --sidebar-width
    // On Windows, bounds.height might include the window frame if not fully frameless. 
    // But getContentBounds gives inner size.
    const titleBarHeight = 28; // Matching titleBarOverlay height in createWindow
    view.setBounds({
        x: sidebarWidth,
        y: titleBarHeight,
        width: bounds.width - sidebarWidth,
        height: bounds.height - titleBarHeight
    });
}

app.commandLine.appendSwitch('disable-features', 'SecCHUA,SecCHUAMobile,SecCHUAPlatform');
app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

app.whenReady().then(async () => {
    const { default: Store } = await import('electron-store');
    store = new Store();

    const DEFAULT_APPS = [
        { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com', icon: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg' },
        { id: 'discord', name: 'Discord', url: 'https://discord.com/app', icon: 'https://assets-global.website-files.com/6257adef9a2dc8d4e0852ffa/636e0a6a49aa1b50461c2901_aHVi.svg' },
        { id: 'slack', name: 'Slack', url: 'https://app.slack.com', icon: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/Slack_icon_2019.svg' },
        { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg' }
    ];

    // Initialize local apps
    if (!store.has('apps')) {
        store.set('apps', DEFAULT_APPS);
    }

    // --- IPC Handlers for Data Sync ---

    ipcMain.handle('get-apps', () => store.get('apps'));

    ipcMain.on('save-apps', (event, apps) => {
        store.set('apps', apps);
    });

    createWindow();

    // Create Tray
    // A simple purple square as a fallback native image icon (16x16)
    const base64Icon = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABDSURBVDhPY3jMwPCfEkw1GAWjBgw1AGhgN1MwNBoYxRDk/s8w/y+mIQxgSsgYnE5jGH0AkcNoIIyGMDEYpRhGzWAAAIf+L+C0zwhlAAAAAElFTkSuQmCC';
    const icon = nativeImage.createFromDataURL(`data:image/png;base64,${base64Icon}`);
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: function () { mainWindow.show(); } },
        {
            label: 'Quit', click: function () {
                isQuitting = true;
                app.quit();
            }
        }
    ]);
    tray.setToolTip('AiO Web Wrapper');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
        }
    });

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // --- Auto Updater Logic ---
    // Log updates somewhere to track them easily
    autoUpdater.logger = require('electron-log');
    autoUpdater.logger.transports.file.level = 'info';

    autoUpdater.on('update-available', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Actualización disponible',
            message: 'Una nueva versión de WrapperOne está disponible. Descargando en segundo plano...'
        });
    });

    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Actualización lista',
            message: 'La nueva versión ha sido descargada. La aplicación se reiniciará para instalarla.',
            buttons: ['Reiniciar y Actualizar']
        }).then(() => {
            setImmediate(() => autoUpdater.quitAndInstall());
        });
    });

    // Check for updates (only works in packaged app, will fail silently in dev)
    autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// Manage views via IPC
ipcMain.on('switch-app', (event, { id, url }) => {
    if (activeAppId === id) return; // Already active

    // Create view if it doesn't exist
    if (!views[id]) {
        const view = new WebContentsView({
            webPreferences: {
                partition: `persist:${id}` // Isolate session per app so multiple instances don't collide
            }
        });
        views[id] = view;
        mainWindow.contentView.addChildView(view);
        // Set a modern Chrome User-Agent before loading URL to prevent blocks (e.g., WhatsApp)
        // Also apply it to network requests to prevent Google Sign-In blocks
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
        view.webContents.setUserAgent(userAgent);

        view.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
            let finalUserAgent = userAgent;

            // Use Firefox UA specifically for Google Sign-in to bypass the security block
            if (details.url.includes('accounts.google.com') || details.url.includes('myaccount.google.com')) {
                finalUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0';
            }

            details.requestHeaders['User-Agent'] = finalUserAgent;
            delete details.requestHeaders['sec-ch-ua'];
            delete details.requestHeaders['sec-ch-ua-mobile'];
            delete details.requestHeaders['sec-ch-ua-platform'];
            callback({ requestHeaders: details.requestHeaders });
        });

        // Prevent web apps like Gmail from opening new separate OS windows
        // Instead, open them in the user's default external browser
        view.webContents.setWindowOpenHandler(({ url }) => {
            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        });

        // Add basic context menu (Copy, Paste, etc.)
        view.webContents.on('context-menu', (event, params) => {
            const menu = Menu.buildFromTemplate([
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'pasteAndMatchStyle' },
                { role: 'delete' },
                { type: 'separator' },
                { role: 'selectAll' }
            ]);
            menu.popup(mainWindow);
        });

        view.webContents.loadURL(url);
    }

    // Remove existing active view from display
    if (activeAppId && views[activeAppId] && !isAppHidden) {
        try {
            mainWindow.contentView.removeChildView(views[activeAppId]);
        } catch (e) { }
    }

    isAppHidden = false;

    // Show new active view
    activeAppId = id;
    const newView = views[id];

    try {
        mainWindow.contentView.addChildView(newView); // Bring to front
    } catch (e) { }

    resizeView(newView);
});

ipcMain.on('remove-app', (event, id) => {
    if (views[id]) {
        try {
            mainWindow.contentView.removeChildView(views[id]);
        } catch (e) { }
        delete views[id];
    }
    if (activeAppId === id) {
        activeAppId = null;
    }
});

// App visibility for modals
ipcMain.on('hide-active-app', () => {
    if (activeAppId && views[activeAppId] && !isAppHidden) {
        try {
            mainWindow.contentView.removeChildView(views[activeAppId]);
            isAppHidden = true;
        } catch (e) { }
    }
});

ipcMain.on('show-active-app', () => {
    if (activeAppId && views[activeAppId] && isAppHidden) {
        try {
            mainWindow.contentView.addChildView(views[activeAppId]);
            resizeView(views[activeAppId]);
            isAppHidden = false;
        } catch (e) { }
    }
});
