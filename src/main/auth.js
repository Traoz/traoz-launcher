const { BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const { URL } = require('url');
const axios = require('axios');

// Microsoft Azure App — public client registered for Minecraft auth
// Uses the same client ID as the official Minecraft launcher
const CLIENT_ID    = '00000000402b5328';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE        = 'XboxLive.signin offline_access';

function profilePath() {
    return path.join(require('electron').app.getPath('userData'), 'profile.json');
}

function getSavedProfile() {
    try {
        if (fs.existsSync(profilePath())) {
            return JSON.parse(fs.readFileSync(profilePath(), 'utf8'));
        }
    } catch {}
    return null;
}

function saveProfile(profile) {
    fs.writeFileSync(profilePath(), JSON.stringify(profile, null, 2));
}

function logout() {
    if (fs.existsSync(profilePath())) fs.unlinkSync(profilePath());
}

async function login(parentWindow) {
    const authUrl =
        `https://login.live.com/oauth20_authorize.srf` +
        `?client_id=${CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(SCOPE)}`;

    const code = await openAuthWindow(parentWindow, authUrl);
    const profile = await exchangeCodeForProfile(code);
    saveProfile(profile);
    return profile;
}

function openAuthWindow(parent, url) {
    return new Promise((resolve, reject) => {
        const win = new BrowserWindow({
            width: 500,
            height: 650,
            parent,
            modal: true,
            webPreferences: { nodeIntegration: false }
        });

        win.loadURL(url);

        win.webContents.on('will-redirect', (event, redirectUrl) => {
            handleRedirect(redirectUrl, win, resolve, reject);
        });

        win.webContents.on('did-navigate', (event, redirectUrl) => {
            handleRedirect(redirectUrl, win, resolve, reject);
        });

        win.on('closed', () => reject(new Error('Login window closed')));
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
    // 1. Exchange code for MS token
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

    // 2. Authenticate with Xbox Live
    const xblRes = await axios.post(
        'https://user.auth.xboxlive.com/user/authenticate',
        {
            Properties: {
                AuthMethod: 'RPS',
                SiteName:   'user.auth.xboxlive.com',
                RpsTicket:  `d=${msToken}`,
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType:    'JWT',
        },
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );
    const xblToken = xblRes.data.Token;
    const userHash = xblRes.data.DisplayClaims.xui[0].uhs;

    // 3. Get XSTS token
    const xstsRes = await axios.post(
        'https://xsts.auth.xboxlive.com/xsts/authorize',
        {
            Properties: {
                SandboxId:  'RETAIL',
                UserTokens: [xblToken],
            },
            RelyingParty: 'rp://api.minecraftservices.com/',
            TokenType:    'JWT',
        },
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );
    const xstsToken = xstsRes.data.Token;

    // 4. Authenticate with Minecraft
    const mcRes = await axios.post(
        'https://api.minecraftservices.com/authentication/login_with_xbox',
        { identityToken: `XBL3.0 x=${userHash};${xstsToken}` },
        { headers: { 'Content-Type': 'application/json' } }
    );
    const mcToken = mcRes.data.access_token;

    // 5. Get Minecraft profile (UUID + username)
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

module.exports = { login, getSavedProfile, saveProfile, logout };
