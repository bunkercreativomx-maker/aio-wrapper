// Diagnostic preload for the web-app views (WhatsApp, ChatGPT, ...).
//
// Why this exists: on Windows, dropping a file onto an embedded web app does nothing. Nothing in
// this app intercepts drops, so the drop is getting lost below the page — either the OS never
// offers it to the window, or Chromium routes it to the wrong WebContents. These listeners run
// INSIDE the web app's page, in an isolated world, and report what (if anything) arrives there.
//
// Purely observational: it never calls preventDefault, so it cannot change drag behaviour.
// Remove once the drag-and-drop bug is fixed.
const { ipcRenderer } = require('electron');

let lastOver = 0;
function report(kind, e) {
    let files = -1;
    let types = [];
    try {
        types = Array.from((e.dataTransfer && e.dataTransfer.types) || []);
        files = (e.dataTransfer && e.dataTransfer.files) ? e.dataTransfer.files.length : -1;
    } catch (err) { /* dataTransfer is protected outside of drop for some events */ }
    ipcRenderer.send('diag-drag', { where: 'view', kind, types, files, url: location.href });
}

['dragenter', 'dragleave', 'drop'].forEach((kind) => {
    window.addEventListener(kind, (e) => report(kind, e), true);
});
// dragover fires dozens of times a second — report at most once per second.
window.addEventListener('dragover', (e) => {
    const now = Date.now();
    if (now - lastOver < 1000) return;
    lastOver = now;
    report('dragover', e);
}, true);
