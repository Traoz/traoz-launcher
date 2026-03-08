const { app } = require('electron');
const fs   = require('fs');
const path = require('path');

function settingsPath() {
    return path.join(app.getPath('userData'), 'settings.json');
}

const DEFAULTS = {
    ram: 2,
    closeLauncherOnLaunch: false,
    trayOnClose: true,
    discordRpc: true,
    accentColor: '#7733cc',
    launchCooldownSec: 5,
    gcFlags: true,
    resWidth: 0,
    resHeight: 0,
    backgroundImage: '',
    opacity: 1.0,
    compactMode: false,
    lightTheme: false,
};

function load() {
    try {
        if (fs.existsSync(settingsPath())) {
            return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
        }
    } catch {}
    return { ...DEFAULTS };
}

function save(data) {
    fs.writeFileSync(settingsPath(), JSON.stringify(data, null, 2));
}

function get(key) { return load()[key]; }

function set(key, value) {
    const s = load();
    s[key] = value;
    save(s);
}

module.exports = { load, get, set };
