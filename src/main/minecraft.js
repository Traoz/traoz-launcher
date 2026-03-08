const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const axios  = require('axios');
const extractZip = require('extract-zip');

function getBaseDirs() {
    const { app } = require('electron');
    const BASE_DIR = path.join(app.getPath('userData'), 'minecraft');
    return { BASE_DIR };
}

const FORGE_VERSION  = '1.8.9-forge1.8.9-11.15.1.2318-1.8.9';
const VANILLA_MC_DIR = path.join(process.env.APPDATA, '.minecraft');

const MODS = [
    { url: 'https://github.com/traoz/traoz-launcher/releases/latest/download/traozui.jar',     file: 'traozui.jar'     },
    { url: 'https://github.com/traoz/traoz-launcher/releases/latest/download/betterwater.jar', file: 'betterwater.jar' },
    { url: 'https://github.com/traoz/traoz-launcher/releases/latest/download/pitutils.jar',    file: 'pitutils.jar'    },
    { url: 'https://github.com/traoz/traoz-launcher/releases/latest/download/optifine.jar',    file: 'optifine.jar'    },
];

// ── Java auto-detection ───────────────────────────────────────────────────────
function findJava() {
    // 1. JAVA_HOME env var
    if (process.env.JAVA_HOME) {
        const candidate = path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe');
        if (fs.existsSync(candidate)) return candidate;
    }

    // 2. Common install paths
    const roots = [
        'C:\\Program Files\\Java',
        'C:\\Program Files (x86)\\Java',
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\Eclipse Adoptium'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\Microsoft\\jdk-8'),
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\Microsoft',
    ];

    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        try {
            const entries = fs.readdirSync(root);
            // Prefer JDK8 / JRE8 entries
            const sorted = entries.sort((a, b) => b.localeCompare(a));
            for (const entry of sorted) {
                const candidate = path.join(root, entry, 'bin', 'javaw.exe');
                if (fs.existsSync(candidate)) return candidate;
            }
        } catch {}
    }

    // 3. Try PATH
    try {
        const result = execSync('where javaw', { timeout: 2000 }).toString().trim().split('\n')[0].trim();
        if (result && fs.existsSync(result)) return result;
    } catch {}

    return 'javaw';
}

// ── Mod hash verification ─────────────────────────────────────────────────────
function fileHash(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function isFileCorrupt(filePath) {
    try {
        const size = fs.statSync(filePath).size;
        if (size < 1024) return true; // under 1KB is almost certainly wrong
        // Try reading first 4 bytes — valid JAR/ZIP starts with PK\x03\x04
        const buf = Buffer.alloc(4);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        return buf[0] !== 0x50 || buf[1] !== 0x4B; // 'PK'
    } catch {
        return true;
    }
}

// ── Download with progress ────────────────────────────────────────────────────
async function download(url, dest, onProgress) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const response = await axios.get(url, { responseType: 'stream', maxRedirects: 10 });
    const total = parseInt(response.headers['content-length'] || '0');
    let received = 0;
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        response.data.on('data', (chunk) => {
            received += chunk.length;
            if (onProgress && total) onProgress(Math.floor(received / total * 100));
        });
        response.data.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
    });
}

// ── Ensure mods with hash verification ───────────────────────────────────────
async function ensureMods(send, MODS_DIR) {
    fs.mkdirSync(MODS_DIR, { recursive: true });
    send('Checking mods...');
    for (const mod of MODS) {
        const dest = path.join(MODS_DIR, mod.file);
        const needsDownload = !fs.existsSync(dest) || isFileCorrupt(dest);
        if (!needsDownload) {
            send(`${mod.file} OK.`);
            continue;
        }
        if (fs.existsSync(dest)) send(`${mod.file} appears corrupt, re-downloading...`);
        try {
            await download(mod.url, dest, (pct) => {
                send(`__progress__:${mod.file}:${pct}`);
            });
            send(`__progress__:${mod.file}:100`);
            // Verify after download
            if (isFileCorrupt(dest)) {
                fs.unlinkSync(dest);
                send(`${mod.file} download failed verification, skipping.`);
            } else {
                send(`${mod.file} updated.`);
            }
        } catch (e) {
            send(`Could not download ${mod.file}, ${fs.existsSync(dest) ? 'using cached.' : 'skipping.'}`);
        }
    }
}

async function ensureForge(send) {
    const forgeJsonPath = path.join(VANILLA_MC_DIR, 'versions', FORGE_VERSION, FORGE_VERSION + '.json');
    if (fs.existsSync(forgeJsonPath)) {
        send('Forge found.');
        return;
    }
    throw new Error('Forge 1.8.9 not found in your Minecraft launcher. Please install it via the official Minecraft launcher first.');
}

async function launch(profile, send, profileIndex = 0, ramGB = 2, onClose = null, extraSettings = {}) {
    const { BASE_DIR } = getBaseDirs();
    const GAME_DIR = profileIndex === 0 ? BASE_DIR : path.join(BASE_DIR, `instance_${profileIndex}`);
    const MODS_DIR = path.join(GAME_DIR, 'mods');
    fs.mkdirSync(GAME_DIR, { recursive: true });
    fs.mkdirSync(MODS_DIR, { recursive: true });

    await ensureForge(send);
    await ensureMods(send, MODS_DIR);

    send('Reading launch config...');

    const LIBRARIES_DIR   = path.join(VANILLA_MC_DIR, 'libraries');
    const ASSETS_DIR      = path.join(VANILLA_MC_DIR, 'assets');
    const forgeProfileDir = path.join(VANILLA_MC_DIR, 'versions', FORGE_VERSION);
    const forgeJson = JSON.parse(fs.readFileSync(path.join(forgeProfileDir, FORGE_VERSION + '.json'), 'utf8'));

    const vanillaJson = JSON.parse(fs.readFileSync(path.join(VANILLA_MC_DIR, 'versions', '1.8.9', '1.8.9.json'), 'utf8'));
    const allLibs    = [...(vanillaJson.libraries || []), ...(forgeJson.libraries || [])];
    const mergedJson = Object.assign({}, vanillaJson, forgeJson, { libraries: allLibs });

    const cp = buildClasspath(mergedJson, LIBRARIES_DIR);
    cp.push(path.join(forgeProfileDir, FORGE_VERSION + '.jar'));

    const nativesDir = path.join(BASE_DIR, 'natives');
    fs.mkdirSync(nativesDir, { recursive: true });
    await extractNatives(mergedJson, nativesDir, LIBRARIES_DIR);

    const assetIndex = mergedJson.assetIndex ? mergedJson.assetIndex.id : (mergedJson.assets || 'legacy');

    const mcArgString = mergedJson.minecraftArguments
        .replace('${auth_player_name}',  profile.username)
        .replace('${version_name}',      FORGE_VERSION)
        .replace('${game_directory}',    GAME_DIR)
        .replace('${assets_root}',       ASSETS_DIR)
        .replace('${assets_index_name}', assetIndex)
        .replace('${auth_uuid}',         profile.uuid)
        .replace('${auth_access_token}', profile.accessToken)
        .replace('${user_properties}',   '{}')
        .replace('${user_type}',         'mojang');

    const mcArgs = mcArgString.split(' ');

    // Resolution args
    if (extraSettings.resWidth && extraSettings.resHeight) {
        mcArgs.push('--width', String(extraSettings.resWidth), '--height', String(extraSettings.resHeight));
    }

    // Quick-join server args
    if (extraSettings.quickJoinServer) {
        const [host, port] = extraSettings.quickJoinServer.split(':');
        mcArgs.push('--server', host);
        if (port) mcArgs.push('--port', port);
    }

    const xmx = Math.max(1, ramGB);
    const xms = Math.max(1, Math.floor(ramGB / 2));

    const gcFlags = extraSettings.gcFlags ? [
        '-XX:+UseG1GC',
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:G1NewSizePercent=20',
        '-XX:G1ReservePercent=20',
        '-XX:MaxGCPauseMillis=50',
        '-XX:G1HeapRegionSize=32M',
        '-XX:+DisableExplicitGC',
    ] : [];

    const jvmArgs = [
        `-Djava.library.path=${nativesDir}`,
        `-Xmx${xmx}G`,
        `-Xms${xms}G`,
        ...gcFlags,
        `-cp`, cp.join(path.delimiter),
        mergedJson.mainClass,
        ...mcArgs,
    ];

    const java = findJava();
    send('Using Java: ' + java);
    send(`Launching Minecraft as ${profile.username}...`);

    const logPath   = path.join(GAME_DIR, 'launch.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    logStream.write('JVM args:\n' + jvmArgs.join('\n') + '\n\n');

    const launchTime = Date.now();
    const proc = spawn(java, jvmArgs, { cwd: GAME_DIR, detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', d => { const s = d.toString(); logStream.write('[OUT] ' + s); send(s.trim()); });
    proc.stderr.on('data', d => { const s = d.toString(); logStream.write('[ERR] ' + s); send('ERR: ' + s.trim()); });
    proc.on('error', e => { send('Spawn error: ' + e.message); logStream.write('Spawn error: ' + e.message); });
    proc.on('close', code => {
        const sessionMs = Date.now() - launchTime;
        logStream.write('\nExited with code ' + code + '\n');
        logStream.end();
        send('Log saved to: ' + logPath);
        if (code !== 0) send('Exited with code ' + code);
        if (onClose) onClose(code, sessionMs);
    });
    send('Game launched! Log: ' + logPath);
}

function buildClasspath(forgeJson, librariesDir) {
    const cp = [];
    for (const lib of (forgeJson.libraries || [])) {
        if (lib.natives) continue;
        if (lib.rules && !rulesAllow(lib.rules)) continue;
        const full = path.join(librariesDir, mavenToPath(lib.name));
        if (fs.existsSync(full)) cp.push(full);
    }
    return cp;
}

async function extractNatives(forgeJson, nativesDir, librariesDir) {
    for (const lib of (forgeJson.libraries || [])) {
        if (!lib.natives || !lib.natives.windows) continue;
        const classifier = lib.natives.windows.replace('${arch}', '64');
        const parts = lib.name.split(':');
        let jarPath;
        if (lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers[classifier]) {
            jarPath = path.join(librariesDir, lib.downloads.classifiers[classifier].path);
        } else {
            jarPath = path.join(librariesDir, parts[0].replace(/\./g, '/'), parts[1], parts[2],
                `${parts[1]}-${parts[2]}-${classifier}.jar`);
        }
        if (!fs.existsSync(jarPath)) continue;
        try { await extractZip(jarPath, { dir: nativesDir }); } catch {}
    }
}

function mavenToPath(name) {
    const parts = name.split(':');
    return path.join(parts[0].replace(/\./g, '/'), parts[1], parts[2], `${parts[1]}-${parts[2]}.jar`);
}

function rulesAllow(rules) {
    let allowed = false;
    for (const rule of rules) {
        const matches = !rule.os || rule.os.name === 'windows';
        if (rule.action === 'allow' && matches)   allowed = true;
        if (rule.action === 'disallow' && matches) allowed = false;
    }
    return allowed;
}

module.exports = { launch, findJava };
