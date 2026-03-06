const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const { execFile, spawn } = require('child_process');
const axios  = require('axios');
const extractZip = require('extract-zip');
function getBaseDirs() {
    const { app } = require('electron');
    const BASE_DIR = path.join(app.getPath('userData'), 'minecraft');
    return {
        BASE_DIR,
        MODS_DIR: path.join(BASE_DIR, 'mods'),
    };
}

const FORGE_VERSION  = '1.8.9-forge1.8.9-11.15.1.2318-1.8.9';
const VANILLA_MC_DIR = path.join(process.env.APPDATA, '.minecraft');

// URL to your hosted mod jar — update this when you release new versions
const MOD_URL = 'https://github.com/traoz/traoz-launcher/releases/latest/download/betterwater.jar';

// Java — check known locations
function findJava() {
    const candidates = [
        'C:\\Program Files\\Java\\jdk1.8.0_202\\bin\\javaw.exe',
        'C:\\Program Files\\Java\\jre1.8.0_481\\bin\\javaw.exe',
        'C:\\Users\\Traoz\\AppData\\Local\\Programs\\Eclipse Adoptium\\jdk-8.0.482.8-hotspot\\bin\\javaw.exe',
        path.join(process.env.APPDATA || '', '../Local/Programs/Eclipse Adoptium/jdk-8.0.482.8-hotspot/bin/javaw.exe'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return 'javaw';
}

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

async function ensureMod(send) {
    const { MODS_DIR } = getBaseDirs();
    const modJar = path.join(MODS_DIR, 'betterwater.jar');
    fs.mkdirSync(MODS_DIR, { recursive: true });
    send('Checking for mod updates...');
    try {
        await download(MOD_URL, modJar);
        send('Mod updated.');
    } catch (e) {
        if (fs.existsSync(modJar)) {
            send('Could not update mod, using cached version.');
        } else {
            send('Mod not available, launching without mod.');
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

async function launch(profile, send) {
    const { BASE_DIR, MODS_DIR } = getBaseDirs();
    fs.mkdirSync(BASE_DIR, { recursive: true });
    fs.mkdirSync(MODS_DIR, { recursive: true });

    await ensureForge(send);
    await ensureMod(send);

    send('Reading launch config...');

    const LIBRARIES_DIR  = path.join(VANILLA_MC_DIR, 'libraries');
    const ASSETS_DIR     = path.join(VANILLA_MC_DIR, 'assets');
    const forgeProfileDir = path.join(VANILLA_MC_DIR, 'versions', FORGE_VERSION);
    const forgeJson = JSON.parse(
        fs.readFileSync(path.join(forgeProfileDir, FORGE_VERSION + '.json'), 'utf8')
    );

    // Forge inherits from vanilla 1.8.9 — merge libraries
    const vanillaJsonPath = path.join(VANILLA_MC_DIR, 'versions', '1.8.9', '1.8.9.json');
    const vanillaJson = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'));

    const allLibs = [...(vanillaJson.libraries || []), ...(forgeJson.libraries || [])];
    const mergedJson = Object.assign({}, vanillaJson, forgeJson, { libraries: allLibs });

    const cp = buildClasspath(mergedJson, LIBRARIES_DIR);
    // Use vanilla jar (Forge inherits from 1.8.9)
    const vanillaJar = path.join(VANILLA_MC_DIR, 'versions', '1.8.9', '1.8.9.jar');
    cp.push(vanillaJar);

    const nativesDir = path.join(BASE_DIR, 'natives');
    fs.mkdirSync(nativesDir, { recursive: true });
    await extractNatives(mergedJson, nativesDir, LIBRARIES_DIR);

    const assetIndex = mergedJson.assetIndex ? mergedJson.assetIndex.id : (mergedJson.assets || 'legacy');

    // Build game args from minecraftArguments template
    const mcArgs = mergedJson.minecraftArguments
        .replace('${auth_player_name}',  profile.username)
        .replace('${version_name}',      FORGE_VERSION)
        .replace('${game_directory}',    BASE_DIR)
        .replace('${assets_root}',       ASSETS_DIR)
        .replace('${assets_index_name}', assetIndex)
        .replace('${auth_uuid}',         profile.uuid)
        .replace('${auth_access_token}', profile.accessToken)
        .replace('${user_properties}',   '{}')
        .replace('${user_type}',         'mojang')
        .split(' ');

    const jvmArgs = [
        `-Djava.library.path=${nativesDir}`,
        `-Xmx2G`,
        `-Xms512M`,
        `-cp`, cp.join(path.delimiter),
        mergedJson.mainClass,
        ...mcArgs,
    ];

    const java = findJava();
    send('Using Java: ' + java);
    send('Launching Minecraft...');
    const logPath = path.join(BASE_DIR, 'launch.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    logStream.write('JVM args:\n' + jvmArgs.join('\n') + '\n\n');

    const proc = spawn(java, jvmArgs, {
        cwd: BASE_DIR,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.stdout.on('data', d => { const s = d.toString(); logStream.write('[OUT] ' + s); send(s.trim()); });
    proc.stderr.on('data', d => { const s = d.toString(); logStream.write('[ERR] ' + s); send('ERR: ' + s.trim()); });
    proc.on('error', e => { send('Spawn error: ' + e.message); logStream.write('Spawn error: ' + e.message); });
    proc.on('close', code => {
        logStream.write('\nExited with code ' + code + '\n');
        logStream.end();
        send('Log saved to: ' + logPath);
        if (code !== 0) send('Exited with code ' + code);
    });
    send('Game launched! Log: ' + logPath);
}

function buildClasspath(forgeJson, librariesDir) {
    const cp = [];
    for (const lib of (forgeJson.libraries || [])) {
        if (lib.natives) continue;
        if (lib.rules && !rulesAllow(lib.rules)) continue;
        const jarPath = mavenToPath(lib.name);
        const full = path.join(librariesDir, jarPath);
        if (fs.existsSync(full)) cp.push(full);
    }
    return cp;
}

async function extractNatives(forgeJson, nativesDir, librariesDir) {
    for (const lib of (forgeJson.libraries || [])) {
        if (!lib.natives || !lib.natives.windows) continue;
        const classifier = lib.natives.windows.replace('${arch}', '64');
        const parts = lib.name.split(':');
        // Try downloads.classifiers path first, then maven convention
        let jarPath;
        if (lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers[classifier]) {
            jarPath = path.join(librariesDir, lib.downloads.classifiers[classifier].path);
        } else {
            jarPath = path.join(
                librariesDir,
                parts[0].replace(/\./g, '/'),
                parts[1], parts[2],
                `${parts[1]}-${parts[2]}-${classifier}.jar`
            );
        }
        if (!fs.existsSync(jarPath)) continue;
        try {
            await extractZip(jarPath, { dir: nativesDir });
        } catch (e) {
            // ignore extraction errors for individual native jars
        }
    }
}

function mavenToPath(name) {
    const parts = name.split(':');
    const group = parts[0].replace(/\./g, '/');
    const artifact = parts[1];
    const version = parts[2];
    return path.join(group, artifact, version, `${artifact}-${version}.jar`);
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

module.exports = { launch };
