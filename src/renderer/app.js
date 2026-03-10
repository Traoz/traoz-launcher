// launcher is exposed globally by preload via contextBridge

const screenLogin     = document.getElementById('screen-login');
const screenMain      = document.getElementById('screen-main');
const screenSettings  = document.getElementById('screen-settings');
const screenInstances = document.getElementById('screen-instances');
const screenCrashlog  = document.getElementById('screen-crashlog');
const btnLogin        = document.getElementById('btn-login');
const btnPlay         = document.getElementById('btn-play');
const loginError      = document.getElementById('login-error');
const usernameLabel   = document.getElementById('username-label');
const activeAvatar    = document.getElementById('active-avatar');
const statusLog       = document.getElementById('status-log');
const accountActive   = document.getElementById('account-active');
const accountDropdown = document.getElementById('account-dropdown');
const accountList     = document.getElementById('account-list');
const btnAddAccount   = document.getElementById('btn-add-account');
const modalLaunch     = document.getElementById('modal-launch');
const modalAccountList = document.getElementById('modal-account-list');
const btnLaunchCancel = document.getElementById('btn-launch-cancel');
const progressBar     = document.getElementById('progress-bar');
const progressLabel   = document.getElementById('progress-label');
const progressFill    = document.getElementById('progress-fill');
const newsPanel       = document.getElementById('news-panel');
const ramSlider       = document.getElementById('ram-slider');
const ramValue        = document.getElementById('ram-value');
const toggleClose     = document.getElementById('toggle-close-on-launch');
const toggleDiscord   = document.getElementById('toggle-discord');
const accentPicker    = document.getElementById('accent-color');
const instanceList    = document.getElementById('instance-list');
const crashlogContent = document.getElementById('crashlog-content');
const totalPlaytime   = document.getElementById('total-playtime');
const downloadOverlay = document.getElementById('download-overlay');
const downloadFile    = document.getElementById('download-file');
const downloadFill    = document.getElementById('download-fill');
const downloadPct     = document.getElementById('download-pct');
const toggleGc          = document.getElementById('toggle-gc');
const toggleCompact     = document.getElementById('toggle-compact');
const toggleTrayOnClose = document.getElementById('toggle-tray-on-close');
const resWidth        = document.getElementById('res-width');
const resHeight       = document.getElementById('res-height');
const opacitySlider   = document.getElementById('opacity-slider');
const opacityValue    = document.getElementById('opacity-value');
const javaPathLabel   = document.getElementById('java-path-label');
const bgImage         = document.getElementById('bg-image');

// ── Sound effects ─────────────────────────────────────────────────────────────
const _audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    try {
        const ctx = _audioCtx;
        const g   = ctx.createGain();
        g.connect(ctx.destination);

        if (type === 'click') {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(880, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.06);
            g.gain.setValueAtTime(0.08, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            o.connect(g);
            o.start();
            o.stop(ctx.currentTime + 0.09);
        } else if (type === 'launch') {
            // Rising sweep
            const o = ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.setValueAtTime(200, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
            g.gain.setValueAtTime(0.12, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            o.connect(g);
            o.start();
            o.stop(ctx.currentTime + 0.36);
        } else if (type === 'error') {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(300, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);
            g.gain.setValueAtTime(0.1, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
            o.connect(g);
            o.start();
            o.stop(ctx.currentTime + 0.19);
        }
    } catch {}
}

// Click sound on all buttons
document.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') playSound('click');
});

// ── Window controls ──────────────────────────────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => launcher.minimize());
document.getElementById('btn-close').addEventListener('click',    () => launcher.close());

// ── Live clock ────────────────────────────────────────────────────────────────
(function startClock() {
    const el = document.getElementById('titlebar-clock');
    function tick() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        el.textContent = `${h}:${m}:${s}`;
    }
    tick();
    setInterval(tick, 1000);
})();

// ── Theme toggle ──────────────────────────────────────────────────────────────
function applyTheme(light) {
    document.body.classList.toggle('light-theme', light);
}

document.getElementById('btn-theme').addEventListener('click', async () => {
    const s = await launcher.getSettings();
    const newVal = !s.lightTheme;
    await launcher.setSetting('lightTheme', newVal);
    applyTheme(newVal);
});

// ── Keyboard shortcut overlay ─────────────────────────────────────────────────
const shortcutOverlay = document.getElementById('shortcut-overlay');

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    if (e.key === '?') {
        shortcutOverlay.classList.toggle('hidden');
        return;
    }
    if (e.key === 'Escape') {
        if (!shortcutOverlay.classList.contains('hidden')) {
            shortcutOverlay.classList.add('hidden');
            return;
        }
        if (!modalLaunch.classList.contains('hidden')) {
            modalLaunch.classList.add('hidden');
            return;
        }
        if (!screenSettings.classList.contains('hidden')) {
            screenSettings.classList.add('hidden');
            prevScreen.classList.remove('hidden');
            return;
        }
        if (!screenInstances.classList.contains('hidden')) {
            screenInstances.classList.add('hidden');
            screenSettings.classList.remove('hidden');
            return;
        }
        if (!screenCrashlog.classList.contains('hidden')) {
            screenCrashlog.classList.add('hidden');
            screenInstances.classList.remove('hidden');
            return;
        }
        return;
    }
    if (e.key === 'Enter') {
        if (!screenMain.classList.contains('hidden') && !btnPlay.disabled) {
            btnPlay.click();
        }
        return;
    }
    if (e.key === 's' || e.key === 'S') {
        if (!screenMain.classList.contains('hidden') || !screenLogin.classList.contains('hidden')) {
            document.getElementById('btn-settings').click();
        }
        return;
    }
    if (e.key === 't' || e.key === 'T') {
        document.getElementById('btn-theme').click();
        return;
    }
});

// ── Update banner ─────────────────────────────────────────────────────────────
launcher.onUpdateAvailable(() => {
    document.getElementById('update-banner').classList.remove('hidden');
});

// ── Accent color ──────────────────────────────────────────────────────────────
function applyAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
    // Compute a slightly lighter hover shade by brightening
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    const lighten = (v) => Math.min(255, v + 20);
    const darken  = (v) => Math.max(0,   v - 30);
    document.documentElement.style.setProperty('--accent-hover',
        `rgb(${lighten(r)},${lighten(g)},${lighten(b)})`);
    document.documentElement.style.setProperty('--accent-dark',
        `rgb(${darken(r)},${darken(g)},${darken(b)})`);
    document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
}

// ── Animated background ───────────────────────────────────────────────────────
(function initBg() {
    const canvas = document.getElementById('bg-canvas');
    const ctx    = canvas.getContext('2d');
    canvas.width  = 900;
    canvas.height = 550;

    const particles = Array.from({ length: 60 }, () => ({
        x:  Math.random() * 900,
        y:  Math.random() * 550,
        r:  Math.random() * 1.5 + 0.3,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3,
        a:  Math.random() * 0.5 + 0.1,
    }));

    function getAccentRgb() {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
        return v || '119,51,204';
    }

    function draw() {
        ctx.clearRect(0, 0, 900, 550);
        const rgb = getAccentRgb();
        for (const p of particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${rgb},${p.a})`;
            ctx.fill();
            p.x += p.dx;
            p.y += p.dy;
            if (p.x < 0 || p.x > 900) p.dx *= -1;
            if (p.y < 0 || p.y > 550) p.dy *= -1;
        }
        requestAnimationFrame(draw);
    }
    draw();
})();

// ── Settings screen ───────────────────────────────────────────────────────────
let prevScreen = screenMain;

document.getElementById('btn-settings').addEventListener('click', async () => {
    prevScreen = screenLogin.classList.contains('hidden') ? screenMain : screenLogin;
    prevScreen.classList.add('hidden');
    screenSettings.classList.remove('hidden');

    const s = await launcher.getSettings();
    ramSlider.value       = s.ram;
    ramValue.textContent  = s.ram;
    toggleClose.checked   = s.closeLauncherOnLaunch;
    toggleTrayOnClose.checked = s.trayOnClose !== false;
    toggleDiscord.checked = s.discordRpc !== false;
    accentPicker.value    = s.accentColor || '#7733cc';
    toggleGc.checked      = s.gcFlags !== false;
    toggleCompact.checked = !!s.compactMode;
    resWidth.value        = s.resWidth  || '';
    resHeight.value       = s.resHeight || '';
    const opPct = Math.round((s.opacity || 1.0) * 100);
    opacitySlider.value   = opPct;
    opacityValue.textContent = opPct + '%';

    // Show detected Java path
    const java = await launcher.detectJava();
    javaPathLabel.textContent = 'Java: ' + java;
});

document.getElementById('btn-settings-back').addEventListener('click', () => {
    screenSettings.classList.add('hidden');
    prevScreen.classList.remove('hidden');
});

ramSlider.addEventListener('input', () => {
    ramValue.textContent = ramSlider.value;
    launcher.setSetting('ram', parseInt(ramSlider.value));
});

toggleClose.addEventListener('change', () => {
    launcher.setSetting('closeLauncherOnLaunch', toggleClose.checked);
});

toggleTrayOnClose.addEventListener('change', () => {
    launcher.setSetting('trayOnClose', toggleTrayOnClose.checked);
});

toggleDiscord.addEventListener('change', () => {
    launcher.setSetting('discordRpc', toggleDiscord.checked);
});

accentPicker.addEventListener('input', () => {
    applyAccent(accentPicker.value);
});

accentPicker.addEventListener('change', () => {
    launcher.setSetting('accentColor', accentPicker.value);
});

toggleGc.addEventListener('change', () => {
    launcher.setSetting('gcFlags', toggleGc.checked);
});

toggleCompact.addEventListener('change', () => {
    launcher.setSetting('compactMode', toggleCompact.checked);
    document.body.classList.toggle('compact', toggleCompact.checked);
});

resWidth.addEventListener('change', () => {
    launcher.setSetting('resWidth', parseInt(resWidth.value) || 0);
});

resHeight.addEventListener('change', () => {
    launcher.setSetting('resHeight', parseInt(resHeight.value) || 0);
});

opacitySlider.addEventListener('input', () => {
    opacityValue.textContent = opacitySlider.value + '%';
    launcher.setSetting('opacity', parseInt(opacitySlider.value) / 100);
});

document.getElementById('btn-pick-bg').addEventListener('click', async () => {
    const dataUrl = await launcher.pickBackground();
    if (dataUrl) applyBackground(dataUrl);
});

document.getElementById('btn-clear-bg').addEventListener('click', async () => {
    await launcher.clearBackground();
    applyBackground('');
});

// Handle compact mode changes from main process (resize event)
launcher.onCompactChanged((compact) => {
    document.body.classList.toggle('compact', compact);
});

function applyBackground(dataUrl) {
    if (dataUrl) {
        bgImage.src = dataUrl;
        bgImage.classList.remove('hidden');
        document.getElementById('bg-canvas').style.opacity = '0.4';
    } else {
        bgImage.src = '';
        bgImage.classList.add('hidden');
        document.getElementById('bg-canvas').style.opacity = '1';
    }
}

// ── Export / Import settings ──────────────────────────────────────────────────
document.getElementById('btn-export-settings').addEventListener('click', async () => {
    const ok = await launcher.exportSettings();
    if (ok) addStatusToast('Settings exported.');
});

document.getElementById('btn-import-settings').addEventListener('click', async () => {
    const imported = await launcher.importSettings();
    if (imported) {
        applyAccent(imported.accentColor || '#7733cc');
        if (imported.backgroundImage) applyBackground(imported.backgroundImage);
        else applyBackground('');
        if (imported.compactMode) document.body.classList.add('compact');
        else document.body.classList.remove('compact');
        addStatusToast('Settings imported — reload settings to see changes.');
    }
});

// ── Instance manager ──────────────────────────────────────────────────────────
document.getElementById('btn-instances').addEventListener('click', async () => {
    screenSettings.classList.add('hidden');
    screenInstances.classList.remove('hidden');
    await renderInstances();
});

document.getElementById('btn-instances-back').addEventListener('click', () => {
    screenInstances.classList.add('hidden');
    screenSettings.classList.remove('hidden');
});

async function renderInstances() {
    const data  = await launcher.getAllProfiles();
    const names = await launcher.getInstanceNames();
    instanceList.innerHTML = '';

    for (let i = 0; i < data.profiles.length; i++) {
        const p    = data.profiles[i];
        const name = names[i] || `Instance ${i + 1}`;

        const row = document.createElement('div');
        row.className = 'instance-row';

        const idx = document.createElement('span');
        idx.className = 'instance-index';
        idx.textContent = `#${i + 1}`;

        const nameInput = document.createElement('input');
        nameInput.className = 'instance-name-input';
        nameInput.value = name;
        nameInput.addEventListener('change', () => {
            launcher.setInstanceName(i, nameInput.value.trim() || `Instance ${i + 1}`);
        });

        const acct = document.createElement('span');
        acct.className = 'instance-account';
        acct.textContent = p.username;

        const crashBtn = document.createElement('button');
        crashBtn.className = 'instance-crashlog-btn';
        crashBtn.textContent = 'Crash Log';
        crashBtn.addEventListener('click', async () => {
            screenInstances.classList.add('hidden');
            screenCrashlog.classList.remove('hidden');
            const log = await launcher.getCrashLog(i);
            crashlogContent.textContent = log || 'No crash log found for this instance.';
        });

        row.appendChild(idx);
        row.appendChild(nameInput);
        row.appendChild(acct);
        row.appendChild(crashBtn);
        instanceList.appendChild(row);
    }
}

// ── Crash log viewer ──────────────────────────────────────────────────────────
document.getElementById('btn-crashlog-back').addEventListener('click', () => {
    screenCrashlog.classList.add('hidden');
    screenInstances.classList.remove('hidden');
});

// ── Startup quotes ────────────────────────────────────────────────────────────
const QUOTES = [
    '"Get to prestige 50 or go home."',
    '"Mystic or bust."',
    '"One care package can change everything."',
    '"The Pit never sleeps."',
    '"Fresh pants don\'t guarantee fresh skills."',
    '"You can\'t spell \'Pit\' without \'it\'."',
    '"Cash out before you die. Always."',
    '"Gold is temporary. Prestige is forever."',
    '"Every kill is a carry."',
    '"You didn\'t get mystic\'d, you got outplayed."',
    '"The grind never stops in the Pit."',
    '"Renaming your sword doesn\'t make you better. (But it helps.)"',
    '"KD doesn\'t matter. Gold does."',
    '"Another day, another care package."',
    '"Enchant first, ask questions later."',
];

function setStartupQuote() {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    document.getElementById('startup-quote-login').textContent = q;
    document.getElementById('startup-quote-main').textContent  = q;
}

setStartupQuote();

// ── Startup animation ─────────────────────────────────────────────────────────
function animateScreenIn(el) {
    el.style.opacity = '0';
    el.style.transform = 'scale(0.96) translateY(8px)';
    el.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'scale(1) translateY(0)';
        });
    });
}

// ── Uptime counter ────────────────────────────────────────────────────────────
const _launcherStartTime = Date.now();
const uptimeLabel = document.getElementById('uptime-label');
setInterval(() => {
    const secs = Math.floor((Date.now() - _launcherStartTime) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    uptimeLabel.textContent = `Uptime: ${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
}, 1000);

// ── Auth / startup ────────────────────────────────────────────────────────────
(async () => {
    const s = await launcher.getSettings();
    applyAccent(s.accentColor || '#7733cc');
    if (s.backgroundImage) applyBackground(s.backgroundImage);
    if (s.compactMode) document.body.classList.add('compact');
    if (s.lightTheme) applyTheme(true);

    const profile = await launcher.checkAuth();
    if (!profile) {
        animateScreenIn(screenLogin);
    }
    if (profile) {
        await showMain(profile);
        // Validate tokens in background after UI is up
        launcher.validateTokens().then(async results => {
            let anyExpired = false;
            for (const r of results) {
                if (!r.valid) {
                    _expiredUuids.add(r.uuid);
                    anyExpired = true;
                }
            }
            if (anyExpired) {
                await refreshAccounts();
                addStatusToast('One or more accounts have expired tokens — please re-login.');
            }
        }).catch(() => {});
    }
})();

// ── Login ─────────────────────────────────────────────────────────────────────
btnLogin.addEventListener('click', async () => {
    btnLogin.disabled = true;
    btnLogin.textContent = 'Logging in...';
    loginError.textContent = '';

    const result = await launcher.login();
    if (result.success) {
        await showMain(result.profile);
    } else {
        loginError.textContent = result.error || 'Login failed';
        btnLogin.disabled = false;
        btnLogin.textContent = 'Login with Microsoft';
    }
});

// ── Add account ───────────────────────────────────────────────────────────────
btnAddAccount.addEventListener('click', async () => {
    accountDropdown.classList.add('hidden');
    btnAddAccount.textContent = 'Logging in...';
    btnAddAccount.disabled = true;

    const result = await launcher.login();
    btnAddAccount.textContent = '+ Add Account';
    btnAddAccount.disabled = false;

    if (result.success) await refreshAccounts();
});

// ── Account dropdown toggle ───────────────────────────────────────────────────
accountActive.addEventListener('click', () => {
    accountDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!accountActive.contains(e.target) && !accountDropdown.contains(e.target)) {
        accountDropdown.classList.add('hidden');
    }
});

// ── Launch cooldown ───────────────────────────────────────────────────────────
let lastLaunchTime = 0;

// ── PLAY ──────────────────────────────────────────────────────────────────────
btnPlay.addEventListener('click', async () => {
    const s = await launcher.getSettings();
    const cooldownMs = (s.launchCooldownSec || 5) * 1000;
    if (Date.now() - lastLaunchTime < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (Date.now() - lastLaunchTime)) / 1000);
        addStatus(`Please wait ${remaining}s before launching again.`, false);
        return;
    }

    const data = await launcher.getAllProfiles();
    const { profiles } = data;

    if (profiles.length === 1) {
        await doLaunch(0);
        return;
    }

    modalAccountList.innerHTML = '';
    for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        const btn = document.createElement('button');
        btn.className = 'modal-account-btn';
        btn.textContent = p.username;
        btn.addEventListener('click', async () => {
            modalLaunch.classList.add('hidden');
            await doLaunch(i);
        });
        modalAccountList.appendChild(btn);
    }

    modalLaunch.classList.remove('hidden');
});

btnLaunchCancel.addEventListener('click', () => {
    modalLaunch.classList.add('hidden');
});

// ── Status listener ───────────────────────────────────────────────────────────
launcher.onStatus((msg) => {
    if (!msg || !msg.trim()) return;

    if (msg.startsWith('__progress__:')) {
        const parts = msg.split(':');
        const file  = parts[1];
        const pct   = parseInt(parts[2]);

        // Show download overlay instead of inline progress bar
        downloadOverlay.classList.remove('hidden');
        downloadFile.textContent  = file;
        downloadFill.style.width  = pct + '%';
        downloadPct.textContent   = pct + '%';

        // Also update inline bar
        progressBar.classList.remove('hidden');
        progressLabel.textContent = `Updating ${file}... ${pct}%`;
        progressFill.style.width  = pct + '%';

        if (pct >= 100) {
            setTimeout(() => {
                downloadOverlay.classList.add('hidden');
                progressBar.classList.add('hidden');
                progressFill.style.width = '0%';
            }, 600);
        }
        return;
    }

    const line = document.createElement('div');
    line.className = 'line' + (msg.toLowerCase().includes('error') ? ' err' : '');
    line.textContent = msg;
    statusLog.appendChild(line);
    statusLog.scrollTop = statusLog.scrollHeight;
});

// ── Launch ────────────────────────────────────────────────────────────────────
const playPulseRing = document.getElementById('play-pulse-ring');

async function doLaunch(profileIndex) {
    playSound('launch');
    lastLaunchTime = Date.now();
    btnPlay.disabled = true;
    btnPlay.textContent = 'LAUNCHING...';
    playPulseRing.classList.add('pulsing');
    statusLog.innerHTML = '';
    progressBar.classList.add('hidden');
    progressFill.style.width = '0%';

    const result = await launcher.launch(profileIndex);
    playPulseRing.classList.remove('pulsing');
    if (result.success) {
        btnPlay.textContent = 'LAUNCHED';
        setTimeout(() => {
            btnPlay.disabled = false;
            btnPlay.textContent = 'PLAY';
        }, 5000);
    } else {
        playSound('error');
        addStatus('Error: ' + (result.error || 'Unknown error'), true);
        btnPlay.disabled = false;
        btnPlay.textContent = 'PLAY';
    }
}

// ── Show main screen ──────────────────────────────────────────────────────────
let _clipboardStarted = false;
async function showMain(profile) {
    screenLogin.classList.add('hidden');
    screenMain.classList.remove('hidden');
    animateScreenIn(screenMain);
    await refreshAccounts();
    loadNews();
    if (!_clipboardStarted) {
        _clipboardStarted = true;
        navigator.clipboard.readText().then(() => startClipboardMonitor()).catch(() => {});
    }
}

// ── Avatar helper ─────────────────────────────────────────────────────────────
function makeAvatarColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360;
    return `hsl(${h},50%,40%)`;
}

// ── Expired token cache ───────────────────────────────────────────────────────
let _expiredUuids = new Set();

// ── Refresh accounts ──────────────────────────────────────────────────────────
async function refreshAccounts() {
    const data = await launcher.getAllProfiles();
    const { profiles, activeIndex } = data;

    const active = profiles[activeIndex];
    usernameLabel.textContent = active ? active.username : 'Player';
    if (active) {
        activeAvatar.textContent       = active.username[0].toUpperCase();
        activeAvatar.style.background  = makeAvatarColor(active.username);
        // Update titlebar and native window title
        document.getElementById('titlebar-title').textContent = `Trident Client — ${active.username}`;
        launcher.setTitlebarAccount(active.username);
    } else {
        document.getElementById('titlebar-title').textContent = 'Trident Client';
        launcher.setTitlebarAccount('');
    }

    // Total playtime
    const totalMs = profiles.reduce((sum, p) => sum + (p.playtimeMs || 0), 0);
    const totalHrs = (totalMs / 3600000).toFixed(1);
    totalPlaytime.textContent = totalMs > 0 ? `Total playtime: ${totalHrs}h across all accounts` : '';

    accountList.innerHTML = '';
    for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        const row = document.createElement('div');
        row.className = 'account-row' + (i === activeIndex ? ' active' : '');

        const info = document.createElement('div');
        info.className = 'account-info';

        const nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.alignItems = 'center';
        nameRow.style.gap = '6px';

        const badge = document.createElement('span');
        badge.className = 'avatar';
        badge.textContent = p.username[0].toUpperCase();
        badge.style.width  = '18px';
        badge.style.height = '18px';
        badge.style.fontSize = '10px';
        badge.style.background = makeAvatarColor(p.username);

        const name = document.createElement('span');
        name.className = 'account-name';
        name.textContent = p.username;

        nameRow.appendChild(badge);
        nameRow.appendChild(name);

        if (_expiredUuids.has(p.uuid)) {
            const warn = document.createElement('span');
            warn.className = 'account-expired-warn';
            warn.textContent = '⚠';
            warn.title = 'Token expired — click to re-login';
            nameRow.appendChild(warn);
        }

        const meta = document.createElement('span');
        meta.className = 'account-meta';
        const lastPlayed  = p.lastPlayed ? new Date(p.lastPlayed).toLocaleDateString() : 'Never';
        const playtimeHrs = p.playtimeMs ? (p.playtimeMs / 3600000).toFixed(1) + 'h' : '0h';
        meta.innerHTML = `${p.launchCount || 0} launches · ${lastPlayed} · <span class="playtime">${playtimeHrs}</span>`;

        info.appendChild(nameRow);
        info.appendChild(meta);
        info.addEventListener('click', async () => {
            await launcher.switchProfile(i);
            accountDropdown.classList.add('hidden');
            await refreshAccounts();
        });

        const remove = document.createElement('button');
        remove.className = 'account-remove';
        remove.textContent = '✕';
        remove.title = 'Remove account';
        remove.addEventListener('click', async (e) => {
            e.stopPropagation();
            const remaining = await launcher.removeProfile(i);
            if (remaining.profiles.length === 0) {
                screenMain.classList.add('hidden');
                screenLogin.classList.remove('hidden');
            } else {
                await refreshAccounts();
            }
        });

        row.appendChild(info);
        row.appendChild(remove);
        accountList.appendChild(row);
    }
}

// ── News ──────────────────────────────────────────────────────────────────────
async function loadNews() {
    const news = await launcher.fetchNews();
    if (news) {
        document.getElementById('news-title').textContent = news.title;
        document.getElementById('news-body').textContent  = news.body;
        newsPanel.classList.remove('hidden');
    }
}

function addStatusToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 400);
    }, 2500);
}

function addStatus(msg, isError) {
    const line = document.createElement('div');
    line.className = 'line' + (isError ? ' err' : ' ok');
    line.textContent = msg;
    statusLog.appendChild(line);
    statusLog.scrollTop = statusLog.scrollHeight;
}

// ── Screenshot gallery ────────────────────────────────────────────────────────
const screenScreenshots = document.getElementById('screen-screenshots');
const screenshotGrid    = document.getElementById('screenshot-grid');
let _screenshotProfileIndex = 0;

document.getElementById('btn-screenshots').addEventListener('click', async () => {
    screenSettings.classList.add('hidden');
    screenScreenshots.classList.remove('hidden');
    animateScreenIn(screenScreenshots);
    await renderScreenshots();
});

document.getElementById('btn-screenshots-back').addEventListener('click', () => {
    screenScreenshots.classList.add('hidden');
    screenSettings.classList.remove('hidden');
});

async function renderScreenshots() {
    screenshotGrid.innerHTML = '<div class="ss-loading">Loading...</div>';
    const data = await launcher.getAllProfiles();
    _screenshotProfileIndex = data.activeIndex || 0;
    const shots = await launcher.getScreenshots(_screenshotProfileIndex);

    screenshotGrid.innerHTML = '';

    if (!shots.length) {
        const empty = document.createElement('div');
        empty.className = 'ss-empty';
        empty.textContent = 'No screenshots found for this instance.';
        screenshotGrid.appendChild(empty);

        const openBtn = document.createElement('button');
        openBtn.className = 'btn-link';
        openBtn.textContent = 'Open screenshots folder';
        openBtn.style.marginTop = '8px';
        openBtn.addEventListener('click', () => launcher.openScreenshotsFolder(_screenshotProfileIndex));
        screenshotGrid.appendChild(openBtn);
        return;
    }

    for (const shot of shots) {
        const tile = document.createElement('div');
        tile.className = 'ss-tile';
        tile.title = shot.name;

        const img = document.createElement('img');
        img.src = shot.dataUrl;
        img.className = 'ss-img';
        img.loading = 'lazy';

        const label = document.createElement('div');
        label.className = 'ss-label';
        label.textContent = shot.name.replace(/\.\w+$/, '');

        tile.appendChild(img);
        tile.appendChild(label);
        screenshotGrid.appendChild(tile);
    }

    const openBtn = document.createElement('button');
    openBtn.className = 'btn-link ss-open-folder';
    openBtn.textContent = 'Open folder';
    openBtn.addEventListener('click', () => launcher.openScreenshotsFolder(_screenshotProfileIndex));
    screenshotGrid.appendChild(openBtn);
}

// ── Clipboard server IP monitor ───────────────────────────────────────────────
const serverToast     = document.getElementById('server-toast');
const serverToastIp   = document.getElementById('server-toast-ip');
let _lastClipboard    = '';
let _pendingServerIp  = '';

const SERVER_IP_RE = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$|^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?$/i;

function startClipboardMonitor() {
    setInterval(async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text === _lastClipboard) return;
            _lastClipboard = text;
            const trimmed = text.trim();
            if (trimmed && SERVER_IP_RE.test(trimmed) && !serverToast.classList.contains('server-toast-show')) {
                _pendingServerIp = trimmed;
                serverToastIp.textContent = trimmed;
                serverToast.classList.remove('hidden');
                requestAnimationFrame(() => serverToast.classList.add('server-toast-show'));
                // Auto-dismiss after 8 seconds
                setTimeout(() => dismissServerToast(), 8000);
            }
        } catch {}
    }, 2000);
}

function dismissServerToast() {
    serverToast.classList.remove('server-toast-show');
    setTimeout(() => serverToast.classList.add('hidden'), 350);
}

document.getElementById('btn-server-dismiss').addEventListener('click', dismissServerToast);

document.getElementById('btn-server-join').addEventListener('click', async () => {
    dismissServerToast();
    // Launch with active profile and pass the server IP
    const data = await launcher.getAllProfiles();
    const { profiles, activeIndex } = data;
    if (!profiles.length) return;
    // Store IP so minecraft.js can use it (pass via settings temporarily)
    await launcher.setSetting('quickJoinServer', _pendingServerIp);
    await doLaunch(activeIndex);
    await launcher.setSetting('quickJoinServer', '');
});

// Start monitoring clipboard only when on main screen (needs permission)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        navigator.clipboard.readText().catch(() => {}).then(() => startClipboardMonitor()).catch(() => {});
    }
});
// Clipboard monitor starts automatically when showMain() is first called.
