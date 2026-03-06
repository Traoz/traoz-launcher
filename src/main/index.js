const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const auth = require('./auth');
const minecraft = require('./minecraft');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 550,
        resizable: false,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        backgroundColor: '#0f0f0f'
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-close',    () => app.quit());

// Auth
ipcMain.handle('auth-login', async () => {
    try {
        const profile = await auth.login(mainWindow);
        return { success: true, profile };
    } catch (e) {
        console.error('Login error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('auth-check', async () => {
    return auth.getSavedProfile();
});

ipcMain.handle('auth-logout', () => {
    auth.logout();
    return true;
});

// Launch
ipcMain.handle('launch', async (event) => {
    const profile = auth.getSavedProfile();
    if (!profile) return { success: false, error: 'Not logged in' };

    const send = (msg) => mainWindow.webContents.send('launch-status', msg);

    try {
        await minecraft.launch(profile, send);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
