const { app, BrowserWindow, WebContentsView, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

// Detached launches (e.g. an AppImage started from the desktop launcher, not a terminal)
// have a closed stdout/stderr pipe. electron-log's console transport then throws EPIPE and
// crashes the main process before the window ever shows. Log to file only, and swallow
// broken-pipe errors just in case.
log.transports.console.level = false;
process.on('uncaughtException', (err) => {
    if (err && (err.code === 'EPIPE' || String(err.message || '').includes('EPIPE'))) return;
    log.error('Uncaught exception:', err);
});

let mainWindow;
let views = {};
let activeAppId = null;
let isAppHidden = false;
let tray = null;
let isQuitting = false;

// --- Single instance: reopening the app restores the existing window instead of spawning a new one ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// Windows-only: groups the taskbar icon + enables tray logo. No-op on Linux/macOS,
// so guard it so nothing Windows-specific runs elsewhere.
const IS_WIN = process.platform === 'win32';
if (IS_WIN) {
    app.setAppUserModelId('com.pakov.wrapperone');
}

function createWindow() {
    // Frameless on every platform so our HTML chrome (topbar / stage / dock) is consistent.
    const winOptions = {
        width: 1200,
        height: 800,
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    };
    if (IS_WIN) {
        // Windows draws native min/max/close over our slim topbar; other platforms get
        // our own in-HTML window controls (see renderer.js) instead.
        winOptions.titleBarOverlay = {
            color: '#0b0c0e', // Matches --bg (deep dark, Omarchy-style)
            symbolColor: '#f4f5f7',
            height: 28
        };
    }
    mainWindow = new BrowserWindow(winOptions);
    mainWindow.setIcon(path.join(__dirname, 'icon.png'));

    mainWindow.loadFile('index.html');

    // Re-frame the active web view once the window is actually shown/painted and whenever
    // its size settles, so the native view never overlaps the HTML dock at the bottom.
    const scheduleResize = () => {
        if (!activeAppId || !views[activeAppId]) return;
        // Let the layout settle before measuring.
        setImmediate(() => {
            if (activeAppId && views[activeAppId]) resizeView(views[activeAppId]);
        });
        setTimeout(() => {
            if (activeAppId && views[activeAppId]) resizeView(views[activeAppId]);
        }, 60);
    };
    mainWindow.once('ready-to-show', scheduleResize);
    mainWindow.on('show', scheduleResize);
    mainWindow.on('maximize', scheduleResize);
    mainWindow.on('unmaximize', scheduleResize);
    mainWindow.on('restore', scheduleResize);

    // Handle Reload shortcut
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
            if (activeAppId && views[activeAppId]) {
                views[activeAppId].webContents.reload();
                event.preventDefault();
            }
        }
        // Ctrl/Cmd+S: cycle to the next app (works while the main window has focus)
        if ((input.control || input.meta) && input.key.toLowerCase() === 's') {
            event.preventDefault();
            mainWindow.webContents.send('cycle-app');
        }
    });

    // Handle window resize to resize active view
    mainWindow.on('resize', () => {
        if (activeAppId && views[activeAppId]) {
            resizeView(views[activeAppId]);
        }
    });

    // Minimize to tray instead of quitting (Windows idiom). On Linux/macOS a normal
    // close is expected, so let the window actually close there.
    mainWindow.on('close', function (event) {
        if (IS_WIN && !isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            event.returnValue = false;
        }
    });
}

function resizeView(view) {
    const bounds = mainWindow.getContentBounds();
    // Layout: a slim top bar (native title controls) + full-bleed web app + bottom dock.
    // The web app (WebContentsView) must stop where the HTML dock begins so the dock stays
    // clickable and visible above it. Keep these in sync with CSS --titlebar-h / --dock-h.
    const TITLEBAR_H = 34;
    const DOCK_H = 84;
    view.setBounds({
        x: 0,
        y: TITLEBAR_H,
        width: bounds.width,
        height: bounds.height - TITLEBAR_H - DOCK_H
    });
}

// On Linux/Wayland the compositor can take a few frames to settle the window size after
// a view is shown, so a single immediate setBounds can be overwritten (leaving the native
// view full-screen and covering the HTML dock). Retry with staggered delays to be safe.
function resizeViewRobust(view) {
    if (!view) return;
    const tries = [0, 80, 250, 600];
    tries.forEach((ms) => {
        setTimeout(() => {
            if (views[activeAppId] === view) resizeView(view);
        }, ms);
    });
}

const UA_BY_PLATFORM = {
    win32: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    darwin: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
};
const CH_PLATFORM = { win32: '"Windows"', linux: '"Linux"', darwin: '"macOS"' };
const MODERN_UA = UA_BY_PLATFORM[process.platform] || UA_BY_PLATFORM.linux;

// Do NOT disable the client-hint features: a real Chrome sends sec-ch-ua*, and their absence
// (as much as a mismatched UA) is what gets embedded browsers flagged by Google.
app.userAgentFallback = MODERN_UA;

if (gotTheLock) app.whenReady().then(async () => {
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
    ipcMain.handle('get-version', () => app.getVersion());
    ipcMain.handle('get-platform', () => process.platform);

    // In-HTML window controls (used on Linux/macOS, where there is no native titlebar overlay)
    ipcMain.on('win-minimize', () => { if (mainWindow) mainWindow.minimize(); });
    ipcMain.on('win-maximize-toggle', () => {
        if (!mainWindow) return;
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    });
    ipcMain.on('win-close', () => { if (mainWindow) mainWindow.close(); });

    ipcMain.on('save-apps', (event, apps) => {
        store.set('apps', apps);
    });

    createWindow();

    // Create Tray
    // Prefer a real logo icon (icon.png) shipped with the app; fall back to a solid square.
    const ICON_SIZES = [16, 24, 32];
    const iconPath = path.join(__dirname, 'icon.png');
    let icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
        const base64Icon = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABDSURBVDhPY3jMwPCfEkw1GAWjBgw1AGhgN1MwNBoYxRDk/s8w/y+mIQxgSsgYnE5jGH0AkcNoIIyGMDEYpRhGzWAAAIf+L+C0zwhlAAAAAElFTkSuQmCC';
        icon = nativeImage.createFromDataURL(`data:image/png;base64,${base64Icon}`);
    }
    // Windows draws the tray at several sizes; give it the highest-res copy available.
    const trayImage = ICON_SIZES.map(sz => icon.resize({ width: sz, height: sz })).reduce((best, img) => img.getSize().width > best.getSize().width ? img : best);
    tray = new Tray(trayImage);
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
    autoUpdater.logger = log;
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
        const userAgent = MODERN_UA;
        view.webContents.setUserAgent(userAgent);

        view.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
            // Present a fully consistent modern Chrome. Deleting the client-hint headers while
            // claiming to be Chrome is itself a bot signal (real Chrome always sends them), so
            // set them to match the UA instead of removing them.
            details.requestHeaders['User-Agent'] = userAgent;
            details.requestHeaders['sec-ch-ua'] = '"Chromium";v="138", "Google Chrome";v="138", "Not?A_Brand";v="24"';
            details.requestHeaders['sec-ch-ua-mobile'] = '?0';
            details.requestHeaders['sec-ch-ua-platform'] = CH_PLATFORM[process.platform] || '"Linux"';
            callback({ requestHeaders: details.requestHeaders });
        });

        // Web apps open many links via window.open(). Login/OAuth flows (Google sign-in and
        // friends) MUST stay inside the app or the user can never authenticate, so allow those
        // as real in-app popups. Everything else opens in the default external browser.
        const AUTH_HOSTS = [
            'accounts.google.com',
            'accounts.youtube.com',
            'myaccount.google.com',
            'login.microsoftonline.com',
            'login.live.com',
            'appleid.apple.com',
            'github.com',
            'api.slack.com',
            'slack.com'
        ];
        view.webContents.setWindowOpenHandler(({ url }) => {
            let isAuth = false;
            try {
                const host = new URL(url).hostname;
                isAuth = AUTH_HOSTS.some((h) => host === h || host.endsWith('.' + h));
            } catch (e) { /* not a URL we can parse */ }

            if (isAuth) {
                // Load the login flow in THIS view instead of spawning a separate window,
                // so the user stays inside the app (no external/popup window).
                view.webContents.loadURL(url);
                return { action: 'deny' };
            }

            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        });

        // Handle Reload shortcut for the active view
        view.webContents.on('before-input-event', (event, input) => {
            if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
                view.webContents.reload();
                event.preventDefault();
            }
            // Ctrl/Cmd+S cycles apps even when this web app has focus
            if ((input.control || input.meta) && input.key.toLowerCase() === 's') {
                event.preventDefault();
                mainWindow.webContents.send('cycle-app');
            }
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

        // Some web apps resize/scroll on load; make sure the view never ends up covering the dock.
        view.webContents.on('did-finish-load', () => {
            setImmediate(() => {
                if (views[id]) resizeViewRobust(views[id]);
            });
        });
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

    resizeViewRobust(newView);
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
            resizeViewRobust(views[activeAppId]);
            isAppHidden = false;
        } catch (e) { }
    }
});
