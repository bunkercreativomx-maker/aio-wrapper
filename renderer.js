import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD3X2npEyrc5D1SAe9Bv4Q0HpVLQJVp4WI",
    authDomain: "wrapper-one.firebaseapp.com",
    projectId: "wrapper-one",
    storageBucket: "wrapper-one.firebasestorage.app",
    messagingSenderId: "630195478390",
    appId: "1:630195478390:web:78f5f6779ed2c6abe9e457"
};

const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);

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
            saveLocalAndCloudApps();
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

    saveLocalAndCloudApps();
    if (window.electronAPI) {
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

    saveLocalAndCloudApps();

    modal.classList.add('hidden');
    addAppForm.reset();
});

const authBtn = document.getElementById('auth-btn');
const authModal = document.getElementById('auth-modal');
const closeAuthBtn = document.getElementById('close-auth-btn');
const authForm = document.getElementById('auth-form');
const authToggleLink = document.getElementById('auth-toggle-link');
const authToggleText = document.getElementById('auth-toggle-text');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');
const accountInfo = document.getElementById('account-info');
const loggedInEmail = document.getElementById('logged-in-email');
const avatarInitial = document.getElementById('avatar-initial');
const logoutBtn = document.getElementById('logout-btn');

let isLoginMode = true;

// Helper to save apps both locally and in cloud
async function saveLocalAndCloudApps() {
    if (window.electronAPI) window.electronAPI.saveApps(apps);
    if (auth.currentUser) {
        try {
            await setDoc(doc(db, "users", auth.currentUser.uid), { apps });
        } catch (e) {
            console.error("Cloud sync failed:", e);
            alert("No se pudo guardar la configuración en la nube. Revisa si Firestore está habilitado en tu proyecto de Firebase. Error: " + e.message);
        }
    }
}

// Auth State Checker
function updateAuthUI(user) {
    if (user) {
        authForm.style.display = 'none';
        accountInfo.style.display = 'block';
        accountInfo.classList.remove('hidden'); // legacy class removal
        loggedInEmail.textContent = user.email;
        avatarInitial.textContent = user.email.charAt(0).toUpperCase();
    } else {
        authForm.style.display = 'block';
        accountInfo.style.display = 'none';
        authTitle.textContent = isLoginMode ? 'Sign In to Sync' : 'Create Account';
    }
}

// React to login/logout automatically
onAuthStateChanged(auth, async (user) => {
    updateAuthUI(user);
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists() && docSnap.data().apps) {
                apps = docSnap.data().apps;
                renderApps();
                if (window.electronAPI) window.electronAPI.saveApps(apps);
            } else {
                // If cloud is empty, upload current defaults
                await setDoc(doc(db, "users", user.uid), { apps });
            }
        } catch (e) {
            console.error("Error pulling cloud data", e);
            alert("Error al cargar tus aplicaciones desde la nube. Asegúrate de que Firestore Database esté creado en Firebase. Error: " + e.message);
        }
    }
});

// Auth Modal Actions
authBtn.addEventListener('click', () => {
    updateAuthUI(auth.currentUser);
    authModal.classList.remove('hidden');
    if (window.electronAPI) window.electronAPI.hideActiveApp();
});

closeAuthBtn.addEventListener('click', () => {
    authModal.classList.add('hidden');
    authError.classList.add('hidden');
    if (window.electronAPI) window.electronAPI.showActiveApp();
});

authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authError.classList.add('hidden');

    if (isLoginMode) {
        authTitle.textContent = 'Sign In to Sync';
        authSubtitle.textContent = 'Save your workspace to the cloud.';
        authSubmitBtn.textContent = 'Sign In';
        authToggleText.textContent = "Don't have an account?";
        authToggleLink.textContent = "Create one";
    } else {
        authTitle.textContent = 'Create Account';
        authSubtitle.textContent = 'Start syncing your apps across devices.';
        authSubmitBtn.textContent = 'Register';
        authToggleText.textContent = "Already have an account?";
        authToggleLink.textContent = "Sign in";
    }
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    authSubmitBtn.textContent = isLoginMode ? 'Signing In...' : 'Registering...';
    authSubmitBtn.disabled = true;
    authError.classList.add('hidden');

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            // Upload current apps on register
            await setDoc(doc(db, "users", cred.user.uid), { apps });
        }
        authForm.reset();
        // UI naturally updates via onAuthStateChanged
    } catch (error) {
        authError.textContent = error.message;
        authError.classList.remove('hidden');
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isLoginMode ? 'Sign In' : 'Register';
    }
});

logoutBtn.addEventListener('click', async () => {
    logoutBtn.textContent = "Signing Out...";
    logoutBtn.disabled = true;

    try {
        await signOut(auth);
    } catch (e) {
        console.error("Logout failed:", e);
    }

    logoutBtn.textContent = "Sign Out";
    logoutBtn.disabled = false;
});

// Close modals when clicking outside
[modal, authModal].forEach(m => {
    m.addEventListener('click', (e) => {
        if (e.target === m) {
            m.classList.add('hidden');
            if (m === modal) addAppForm.reset();
            if (window.electronAPI) window.electronAPI.showActiveApp();
        }
    });
});

// Initial load
async function init() {
    if (window.electronAPI) {
        apps = await window.electronAPI.getApps();
    }
    renderApps();
}

init();
