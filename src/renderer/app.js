// launcher is exposed globally by preload via contextBridge

const screenLogin = document.getElementById('screen-login');
const screenMain  = document.getElementById('screen-main');
const btnLogin    = document.getElementById('btn-login');
const btnLogout   = document.getElementById('btn-logout');
const btnPlay     = document.getElementById('btn-play');
const loginError  = document.getElementById('login-error');
const usernameLabel = document.getElementById('username-label');
const statusLog   = document.getElementById('status-log');

// Window controls
document.getElementById('btn-minimize').addEventListener('click', () => launcher.minimize());
document.getElementById('btn-close').addEventListener('click',    () => launcher.close());

// Check existing auth on load
(async () => {
    const profile = await launcher.checkAuth();
    if (profile) {
        showMain(profile);
    }
})();

// Login
btnLogin.addEventListener('click', async () => {
    btnLogin.disabled = true;
    btnLogin.textContent = 'Logging in...';
    loginError.textContent = '';

    const result = await launcher.login();
    if (result.success) {
        showMain(result.profile);
    } else {
        loginError.textContent = result.error || 'Login failed';
        btnLogin.disabled = false;
        btnLogin.textContent = 'Login with Microsoft';
    }
});

// Logout
btnLogout.addEventListener('click', async () => {
    await launcher.logout();
    screenMain.classList.add('hidden');
    screenLogin.classList.remove('hidden');
});

// Launch
btnPlay.addEventListener('click', async () => {
    btnPlay.disabled = true;
    btnPlay.textContent = 'LAUNCHING...';
    statusLog.innerHTML = '';

    launcher.onStatus((msg) => {
        if (!msg || !msg.trim()) return;
        const line = document.createElement('div');
        line.className = 'line' + (msg.toLowerCase().includes('error') ? ' err' : '');
        line.textContent = msg;
        statusLog.appendChild(line);
        statusLog.scrollTop = statusLog.scrollHeight;
    });

    const result = await launcher.launch();
    if (result.success) {
        btnPlay.textContent = 'LAUNCHED';
        setTimeout(() => {
            btnPlay.disabled = false;
            btnPlay.textContent = 'PLAY';
        }, 5000);
    } else {
        addStatus('Error: ' + (result.error || 'Unknown error'), true);
        btnPlay.disabled = false;
        btnPlay.textContent = 'PLAY';
    }
});

function showMain(profile) {
    usernameLabel.textContent = profile.username;
    screenLogin.classList.add('hidden');
    screenMain.classList.remove('hidden');
}

function addStatus(msg, isError) {
    const line = document.createElement('div');
    line.className = 'line' + (isError ? ' err' : ' ok');
    line.textContent = msg;
    statusLog.appendChild(line);
    statusLog.scrollTop = statusLog.scrollHeight;
}
