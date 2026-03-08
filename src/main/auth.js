const { BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');
const { URL } = require('url');
const axios = require('axios');

const CLIENT_ID    = '00000000402b5328';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE        = 'XboxLive.signin offline_access';

function profilesPath() {
    return path.join(require('electron').app.getPath('userData'), 'profiles.json');
}

function loadProfiles() {
    try {
        if (fs.existsSync(profilesPath())) {
            return JSON.parse(fs.readFileSync(profilesPath(), 'utf8'));
        }
    } catch {}
    // Migrate old single profile.json if it exists
    const oldPath = path.join(require('electron').app.getPath('userData'), 'profile.json');
    if (fs.existsSync(oldPath)) {
        try {
            const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
            const data = { profiles: [old], activeIndex: 0 };
            fs.writeFileSync(profilesPath(), JSON.stringify(data, null, 2));
            fs.unlinkSync(oldPath);
            return data;
        } catch {}
    }
    return { profiles: [], activeIndex: 0 };
}

function saveProfiles(data) {
    fs.writeFileSync(profilesPath(), JSON.stringify(data, null, 2));
}

function getSavedProfile() {
    const data = loadProfiles();
    if (!data.profiles.length) return null;
    // Auto-select most recently played account
    let best = data.activeIndex;
    let bestTime = 0;
    data.profiles.forEach((p, i) => {
        const t = p.lastPlayed ? new Date(p.lastPlayed).getTime() : 0;
        if (t > bestTime) { bestTime = t; best = i; }
    });
    if (best !== data.activeIndex) {
        data.activeIndex = best;
        saveProfiles(data);
    }
    return data.profiles[data.activeIndex] || data.profiles[0];
}

function getAllProfiles() {
    return loadProfiles();
}

function switchProfile(index) {
    const data = loadProfiles();
    if (index >= 0 && index < data.profiles.length) {
        data.activeIndex = index;
        saveProfiles(data);
    }
    return getSavedProfile();
}

function removeProfile(index) {
    const data = loadProfiles();
    data.profiles.splice(index, 1);
    if (data.activeIndex >= data.profiles.length) {
        data.activeIndex = Math.max(0, data.profiles.length - 1);
    }
    saveProfiles(data);
    return loadProfiles();
}

function logout() {
    const data = loadProfiles();
    data.profiles.splice(data.activeIndex, 1);
    if (data.activeIndex >= data.profiles.length) {
        data.activeIndex = Math.max(0, data.profiles.length - 1);
    }
    saveProfiles(data);
}

async function login(parentWindow) {
    const authUrl =
        `https://login.live.com/oauth20_authorize.srf` +
        `?client_id=${CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(SCOPE)}` +
        `&prompt=select_account`;

    const code = await openAuthWindow(parentWindow, authUrl);
    const profile = await exchangeCodeForProfile(code);

    const data = loadProfiles();
    // Replace if UUID already exists, otherwise add
    const existing = data.profiles.findIndex(p => p.uuid === profile.uuid);
    if (existing >= 0) {
        data.profiles[existing] = profile;
        data.activeIndex = existing;
    } else {
        data.profiles.push(profile);
        data.activeIndex = data.profiles.length - 1;
    }
    saveProfiles(data);
    return profile;
}

function openAuthWindow(parent, url) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, val) => { if (!settled) { settled = true; fn(val); } };

        const win = new BrowserWindow({
            width: 500,
            height: 650,
            parent,
            modal: true,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });

        win.loadURL(url);

        win.webContents.on('will-redirect', (event, redirectUrl) => {
            handleRedirect(redirectUrl, win, (v) => done(resolve, v), (e) => done(reject, e));
        });

        win.webContents.on('did-navigate', (event, redirectUrl) => {
            handleRedirect(redirectUrl, win, (v) => done(resolve, v), (e) => done(reject, e));
        });

        win.on('closed', () => done(reject, new Error('Login window closed')));
    });
}

function handleRedirect(url, win, resolve, reject) {
    if (!url.startsWith('https://login.live.com/oauth20_desktop.srf')) return;
    const parsed = new URL(url);
    const code  = parsed.searchParams.get('code');
    const error = parsed.searchParams.get('error');
    win.close();
    if (error) return reject(new Error(error));
    if (code)  return resolve(code);
    reject(new Error('No code in redirect'));
}

async function exchangeCodeForProfile(code) {
    const tokenRes = await axios.post(
        'https://login.live.com/oauth20_token.srf',
        new URLSearchParams({
            client_id:    CLIENT_ID,
            code,
            grant_type:   'authorization_code',
            redirect_uri: REDIRECT_URI,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const msToken = tokenRes.data.access_token;

    const xblRes = await axios.post(
        'https://user.auth.xboxlive.com/user/authenticate',
        {
            Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msToken}` },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT',
        },
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );
    const xblToken = xblRes.data.Token;
    const userHash = xblRes.data.DisplayClaims.xui[0].uhs;

    const xstsRes = await axios.post(
        'https://xsts.auth.xboxlive.com/xsts/authorize',
        {
            Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
            RelyingParty: 'rp://api.minecraftservices.com/',
            TokenType: 'JWT',
        },
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );
    const xstsToken = xstsRes.data.Token;

    const mcRes = await axios.post(
        'https://api.minecraftservices.com/authentication/login_with_xbox',
        { identityToken: `XBL3.0 x=${userHash};${xstsToken}` },
        { headers: { 'Content-Type': 'application/json' } }
    );
    const mcToken = mcRes.data.access_token;

    const profileRes = await axios.get(
        'https://api.minecraftservices.com/minecraft/profile',
        { headers: { Authorization: `Bearer ${mcToken}` } }
    );

    return {
        username:    profileRes.data.name,
        uuid:        profileRes.data.id,
        accessToken: mcToken,
    };
}

function recordLaunch(uuid, sessionMs) {
    const data = loadProfiles();
    const p = data.profiles.find(pr => pr.uuid === uuid);
    if (p) {
        p.launchCount  = (p.launchCount || 0) + 1;
        p.lastPlayed   = new Date().toISOString();
        if (sessionMs) p.playtimeMs = (p.playtimeMs || 0) + sessionMs;
        saveProfiles(data);
    }
}

// Returns array of { uuid, username, valid } for each profile
async function validateTokens() {
    const data = loadProfiles();
    const results = [];
    for (const p of data.profiles) {
        let valid = false;
        try {
            const res = await axios.get(
                'https://api.minecraftservices.com/minecraft/profile',
                { headers: { Authorization: `Bearer ${p.accessToken}` }, timeout: 5000 }
            );
            valid = !!res.data.id;
        } catch {}
        results.push({ uuid: p.uuid, username: p.username, valid });
    }
    return results;
}

module.exports = { login, getSavedProfile, getAllProfiles, switchProfile, removeProfile, logout, recordLaunch, validateTokens };
