// Steam library for the "Shop" channel: owned games (public Steam profile) plus what is
// installed locally. Installing and starting go through the running Steam client (steam:// URLs).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const HOME = os.homedir();
const STEAM_ROOTS = [
    path.join(HOME, '.steam', 'steam'),
    path.join(HOME, '.local', 'share', 'Steam'),
    path.join(HOME, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')
];

function findSteamRoot() {
    return STEAM_ROOTS.find((p) => fs.existsSync(path.join(p, 'steamapps')) || fs.existsSync(path.join(p, 'config')));
}

// Minimal reader for Valve's text format (VDF): returns nested objects of strings
function parseVdf(text) {
    const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}]/g) || [];
    let i = 0;
    function block() {
        const obj = {};
        while (i < tokens.length) {
            const t = tokens[i++];
            if (t === '}') return obj;
            const key = t.slice(1, -1);
            const next = tokens[i++];
            if (next === '{') obj[key] = block();
            else if (next) obj[key] = next.slice(1, -1).replace(/\\(.)/g, '$1');
        }
        return obj;
    }
    return block();
}

function readVdf(file) {
    try { return parseVdf(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

// Games with a finished download in any Steam library folder
function installedGames(root) {
    const dirs = new Set([path.join(root, 'steamapps')]);
    const libs = readVdf(path.join(root, 'steamapps', 'libraryfolders.vdf'));
    const folders = libs && (libs.libraryfolders || libs.LibraryFolders);
    if (folders) Object.values(folders).forEach((f) => {
        const p = typeof f === 'string' ? f : f && f.path;
        if (p) dirs.add(path.join(p, 'steamapps'));
    });
    const games = new Map();
    for (const dir of dirs) {
        let files = [];
        try { files = fs.readdirSync(dir); } catch (e) { continue; }
        for (const f of files) {
            if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
            const st = (readVdf(path.join(dir, f)) || {}).AppState;
            if (!st || !st.appid) continue;
            // StateFlags bit 4 = fully installed
            if ((parseInt(st.StateFlags, 10) & 4) === 0) continue;
            games.set(st.appid, { appid: st.appid, name: st.name || ('App ' + st.appid), installed: true });
        }
    }
    return games;
}

// SteamID64 of the account that logged in last
function currentSteamId(root) {
    const users = (readVdf(path.join(root, 'config', 'loginusers.vdf')) || {}).users;
    if (!users) return null;
    const ids = Object.keys(users);
    return ids.find((id) => users[id].MostRecent === '1') || ids[0] || null;
}

function decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

// Owned games from the public profile list. Needs "Game details" set to public in Steam.
async function ownedGames(steamId) {
    const res = await fetch('https://steamcommunity.com/profiles/' + steamId + '/games?tab=all&xml=1', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('Steam answered with HTTP ' + res.status);
    const xml = await res.text();
    const games = [];
    const re = /<game>\s*<appID>(\d+)<\/appID>\s*<name>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/name>/g;
    let m;
    while ((m = re.exec(xml))) games.push({ appid: m[1], name: decodeXml(m[2] !== undefined ? m[2] : m[3]) });
    return games;
}

async function getLibrary() {
    const root = findSteamRoot();
    if (!root) return { ok: false, code: 'nosteam', error: 'Steam was not found on this computer.' };
    const installed = installedGames(root);
    const result = { ok: true, games: [], note: '' };
    let owned = [];
    const id = currentSteamId(root);
    if (!id) {
        result.note = 'Log in to Steam once to see all your games. Showing installed games only.';
    } else {
        try {
            owned = await ownedGames(id);
            if (!owned.length) result.note = 'No games found. Set "Game details" in your Steam profile privacy to public to see your whole library. Showing installed games only.';
        } catch (e) {
            result.note = "Couldn't load your library (" + e.message + '). Showing installed games only.';
        }
    }
    const all = new Map();
    owned.forEach((g) => all.set(g.appid, { appid: g.appid, name: g.name, installed: installed.has(g.appid) }));
    installed.forEach((g, k) => { if (!all.has(k)) all.set(k, g); });
    // tools and runtimes from the client are not games
    result.games = [...all.values()]
        .filter((g) => !/^(Steam Linux Runtime|Proton|Steamworks Common)/i.test(g.name))
        .sort((a, b) => (b.installed - a.installed) || a.name.localeCompare(b.name));
    return result;
}

// silent = start Steam minimized when it is not running yet, so only the game shows up
function openUrl(url, silent) {
    const tryRun = (cmd, args) => new Promise((resolve) => {
        const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
        child.once('error', (e) => resolve({ ok: false, code: e.code }));
        child.once('spawn', () => { child.unref(); resolve({ ok: true }); });
    });
    return tryRun('steam', silent ? ['-silent', url] : [url]).then((r) => (r.ok || r.code !== 'ENOENT') ? r : tryRun('xdg-open', [url]));
}

const ACTIONS = { install: 'steam://install/', start: 'steam://rungameid/', uninstall: 'steam://uninstall/' };

function register(ipcMain) {
    ipcMain.handle('steam-library', () => getLibrary().catch((e) => ({ ok: false, error: e.message })));
    ipcMain.handle('steam-action', (e, kind, appid) => {
        // only plain numeric app ids reach the command line
        if (!ACTIONS[kind] || !/^\d{1,10}$/.test(String(appid))) return { ok: false, error: 'invalid request' };
        return openUrl(ACTIONS[kind] + appid, kind === 'start');
    });
}

module.exports = { register, parseVdf, installedGames, currentSteamId };
