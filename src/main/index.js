const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs   = require('fs');
const axios = require('axios');
const auth     = require('./auth');
const minecraft = require('./minecraft');
const settings  = require('./settings');

let mainWindow;
let tray;
let discordClient = null;
let rpcReady = false;

// ── Discord RPC ──────────────────────────────────────────────────────────────
function initDiscordRpc() {
    try {
        const DiscordRPC = require('discord-rpc');
        const CLIENT_ID = '1234567890123456789'; // replace with your Discord app client ID
        DiscordRPC.register(CLIENT_ID);
        discordClient = new DiscordRPC.Client({ transport: 'ipc' });
        discordClient.on('ready', () => {
            rpcReady = true;
            setRpcIdle();
        });
        discordClient.login({ clientId: CLIENT_ID }).catch(() => {});
    } catch {}
}

function setRpcIdle() {
    if (!rpcReady || !discordClient) return;
    try {
        discordClient.setActivity({
            details: 'In Launcher',
            state: 'Idle',
            largeImageKey: 'logo',
            largeImageText: 'Trident Client',
            instance: false,
        });
    } catch {}
}

function setRpcPlaying(username) {
    if (!rpcReady || !discordClient) return;
    try {
        discordClient.setActivity({
            details: 'Playing Minecraft',
            state: `as ${username}`,
            largeImageKey: 'logo',
            largeImageText: 'Trident Client',
            startTimestamp: Date.now(),
            instance: false,
        });
    } catch {}
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
    const compact = settings.get('compactMode');
    const opacity = settings.get('opacity') || 1.0;

    mainWindow = new BrowserWindow({
        width:  compact ? 600 : 900,
        height: compact ? 350 : 550,
        resizable: false,
        frame: false,
        opacity,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        backgroundColor: '#0f0f0f'
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.on('close', (e) => {
        e.preventDefault();
        if (settings.get('trayOnClose') !== false) {
            mainWindow.hide();
        } else {
            app.exit(0);
        }
    });

    setupTray();
    setupAutoUpdater();

    if (settings.get('discordRpc')) initDiscordRpc();
}

function setupTray() {
    const iconPath = path.join(__dirname, '../../assets/icon.ico');
    const icon = fs.existsSync(iconPath)
        ? nativeImage.createFromPath(iconPath)
        : nativeImage.createEmpty();

    tray = new Tray(icon);
    updateTrayTooltip();
    tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open',  click: () => { mainWindow.show(); mainWindow.focus(); } },
        { type: 'separator' },
        { label: 'Quit',  click: () => { app.exit(0); } },
    ]));
}

function updateTrayTooltip() {
    if (!tray) return;
    try {
        const profile = auth.getSavedProfile();
        tray.setToolTip('Trident Client' + (profile ? ` — ${profile.username}` : ''));
    } catch { tray.setToolTip('Trident Client'); }
}

function setupAutoUpdater() {
    try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.on('update-available', () => {
            mainWindow.webContents.send('update-available');
        });
        autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    } catch {}
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { /* stay alive in tray */ });
app.on('before-quit', () => {
    if (tray) tray.destroy();
    if (discordClient) { try { discordClient.destroy(); } catch {} }
});

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-close',    () => {
    if (settings.get('trayOnClose') !== false) {
        mainWindow.hide();
    } else {
        app.exit(0);
    }
});
ipcMain.on('set-titlebar-account', (event, username) => {
    if (mainWindow) mainWindow.setTitle(username ? `Trident Client — ${username}` : 'Trident Client');
});

// ── Auth ─────────────────────────────────────────────────────────────────────
ipcMain.handle('auth-login', async () => {
    try {
        const profile = await auth.login(mainWindow);
        updateTrayTooltip();
        return { success: true, profile };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('auth-check',          async () => auth.getSavedProfile());
ipcMain.handle('auth-logout',         () => { auth.logout(); updateTrayTooltip(); return true; });
ipcMain.handle('auth-get-all',        () => auth.getAllProfiles());
ipcMain.handle('auth-switch',         (event, index) => { const p = auth.switchProfile(index); updateTrayTooltip(); return p; });
ipcMain.handle('auth-remove',         (event, index) => { const r = auth.removeProfile(index); updateTrayTooltip(); return r; });
ipcMain.handle('auth-validate-tokens', async () => auth.validateTokens());

// ── Settings ─────────────────────────────────────────────────────────────────
ipcMain.handle('settings-get', () => settings.load());
ipcMain.handle('settings-set', (event, key, value) => {
    settings.set(key, value);
    if (key === 'discordRpc') {
        if (value && !discordClient) initDiscordRpc();
        else if (!value && discordClient) {
            try { discordClient.destroy(); } catch {}
            discordClient = null;
            rpcReady = false;
        }
    }
    if (key === 'opacity') {
        try { mainWindow.setOpacity(Math.min(1, Math.max(0.1, value))); } catch {}
    }
    if (key === 'compactMode') {
        const [w, h] = value ? [600, 350] : [900, 550];
        mainWindow.setSize(w, h);
        mainWindow.webContents.send('compact-mode-changed', value);
    }
    return true;
});

// ── Background image ──────────────────────────────────────────────────────────
ipcMain.handle('pick-background', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose background image',
        filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','gif','webp'] }],
        properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const imgPath = result.filePaths[0];
    const buf = fs.readFileSync(imgPath);
    const ext = path.extname(imgPath).slice(1).toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
               : ext === 'png' ? 'image/png'
               : ext === 'gif' ? 'image/gif'
               : 'image/webp';
    const dataUrl = `data:${mime};base64,` + buf.toString('base64');
    settings.set('backgroundImage', dataUrl);
    return dataUrl;
});

ipcMain.handle('clear-background', () => {
    settings.set('backgroundImage', '');
    return true;
});

// ── Java detection ────────────────────────────────────────────────────────────
ipcMain.handle('detect-java', () => {
    return minecraft.findJava();
});

// ── Export / Import settings ──────────────────────────────────────────────────
ipcMain.handle('export-settings', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export settings',
        defaultPath: 'trident-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    const data = settings.load();
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    return true;
});

ipcMain.handle('import-settings', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import settings',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    try {
        const imported = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
        // Merge over current settings (don't wipe unknown keys)
        const current = settings.load();
        const merged  = Object.assign({}, current, imported);
        // Apply sensitive-but-safe values
        for (const [k, v] of Object.entries(merged)) {
            settings.set(k, v);
        }
        // Apply opacity and compact live
        if (merged.opacity) {
            try { mainWindow.setOpacity(Math.min(1, Math.max(0.1, merged.opacity))); } catch {}
        }
        if (typeof merged.compactMode !== 'undefined') {
            const [w, h] = merged.compactMode ? [600, 350] : [900, 550];
            mainWindow.setSize(w, h);
            mainWindow.webContents.send('compact-mode-changed', merged.compactMode);
        }
        return merged;
    } catch {
        return null;
    }
});

// ── News ─────────────────────────────────────────────────────────────────────
ipcMain.handle('fetch-news', async () => {
    try {
        const res = await axios.get(
            'https://api.github.com/repos/traoz/traoz-launcher/releases/latest',
            { headers: { 'User-Agent': 'traoz-launcher' }, timeout: 5000 }
        );
        return { title: res.data.name || res.data.tag_name, body: res.data.body || '' };
    } catch {
        return null;
    }
});

// ── Crash log ─────────────────────────────────────────────────────────────────
ipcMain.handle('get-crash-log', (event, profileIndex) => {
    try {
        const BASE_DIR = path.join(app.getPath('userData'), 'minecraft');
        const GAME_DIR = profileIndex === 0 ? BASE_DIR : path.join(BASE_DIR, `instance_${profileIndex}`);
        const logPath  = path.join(GAME_DIR, 'launch.log');
        if (!fs.existsSync(logPath)) return null;
        const lines = fs.readFileSync(logPath, 'utf8').split('\n');
        return lines.slice(-200).join('\n');
    } catch {
        return null;
    }
});

// ── Instance names ────────────────────────────────────────────────────────────
ipcMain.handle('get-instance-names', () => {
    try {
        const p = path.join(app.getPath('userData'), 'instances.json');
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return {};
});

ipcMain.handle('set-instance-name', (event, index, name) => {
    const p = path.join(app.getPath('userData'), 'instances.json');
    let data = {};
    try { if (fs.existsSync(p)) data = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
    data[index] = name;
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    return true;
});

// ── Screenshot gallery ────────────────────────────────────────────────────────
ipcMain.handle('get-screenshots', (event, profileIndex) => {
    try {
        const BASE_DIR = path.join(app.getPath('userData'), 'minecraft');
        const GAME_DIR = profileIndex === 0 ? BASE_DIR : path.join(BASE_DIR, `instance_${profileIndex}`);
        const ssDir = path.join(GAME_DIR, 'screenshots');
        if (!fs.existsSync(ssDir)) return [];
        return fs.readdirSync(ssDir)
            .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
            .sort((a, b) => {
                const sa = fs.statSync(path.join(ssDir, a)).mtimeMs;
                const sb = fs.statSync(path.join(ssDir, b)).mtimeMs;
                return sb - sa;
            })
            .slice(0, 48)
            .map(f => {
                const buf = fs.readFileSync(path.join(ssDir, f));
                return { name: f, dataUrl: 'data:image/png;base64,' + buf.toString('base64') };
            });
    } catch { return []; }
});

ipcMain.handle('open-screenshots-folder', (event, profileIndex) => {
    const BASE_DIR = path.join(app.getPath('userData'), 'minecraft');
    const GAME_DIR = profileIndex === 0 ? BASE_DIR : path.join(BASE_DIR, `instance_${profileIndex}`);
    const ssDir = path.join(GAME_DIR, 'screenshots');
    fs.mkdirSync(ssDir, { recursive: true });
    require('electron').shell.openPath(ssDir);
    return true;
});

// ── Launch ────────────────────────────────────────────────────────────────────
ipcMain.handle('launch', async (event, profileIndex) => {
    const data    = auth.getAllProfiles();
    const profile = data.profiles[profileIndex];
    if (!profile) return { success: false, error: 'Account not found' };

    const send         = (msg) => mainWindow.webContents.send('launch-status', msg);
    const s            = settings.load();
    const ramGB        = s.ram;
    const hideOnLaunch = s.closeLauncherOnLaunch;
    const extraSettings = {
        gcFlags:         s.gcFlags !== false,
        resWidth:        s.resWidth  || 0,
        resHeight:       s.resHeight || 0,
        quickJoinServer: s.quickJoinServer || '',
    };

    if (hideOnLaunch) {
        mainWindow.hide();
        new Notification({ title: 'Trident Client', body: `Launching as ${profile.username}. Running in tray.` }).show();
    }
    setRpcPlaying(profile.username);

    try {
        await minecraft.launch(profile, send, profileIndex, ramGB, (code, sessionMs) => {
            auth.recordLaunch(profile.uuid, sessionMs);
            setRpcIdle();
            new Notification({ title: 'Trident Client', body: 'Minecraft has closed.' }).show();
            mainWindow.show();
            mainWindow.focus();
        }, extraSettings);
        return { success: true };
    } catch (e) {
        if (hideOnLaunch) { mainWindow.show(); mainWindow.focus(); }
        setRpcIdle();
        return { success: false, error: e.message };
    }
});
