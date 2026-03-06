const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
    minimize:    ()  => ipcRenderer.send('window-minimize'),
    close:       ()  => ipcRenderer.send('window-close'),
    login:       ()  => ipcRenderer.invoke('auth-login'),
    checkAuth:   ()  => ipcRenderer.invoke('auth-check'),
    logout:      ()  => ipcRenderer.invoke('auth-logout'),
    launch:      ()  => ipcRenderer.invoke('launch'),
    onStatus:    (cb) => ipcRenderer.on('launch-status', (_, msg) => cb(msg)),
});
