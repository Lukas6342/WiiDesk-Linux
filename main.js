const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { listApps } = require('./desktop-apps');

let win = null;

function createWindow() {
    win = new BrowserWindow({
        fullscreen: true,
        frame: false,
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'assets', 'favicon.png'),
        webPreferences: {
            // The renderer calls require('electron') and require('fs') directly (script.js, storage.js)
            nodeIntegration: true,
            contextIsolation: false,
            autoplayPolicy: 'no-user-gesture-required'
        }
    });

    win.setMenu(null);
    win.loadFile(path.join(__dirname, 'index.html'));

    // Lets the renderer pause/resume the background music
    win.on('blur', () => win.webContents.send('window-blur'));
    win.on('focus', () => win.webContents.send('window-focus'));

    // Emergency exit / logout: Ctrl+Alt+Q quits WiiDesk
    win.webContents.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && input.control && input.alt && input.key.toLowerCase() === 'q') {
            app.quit();
        }
    });

    win.on('closed', () => { win = null; });
}

// Start a detached process; resolves once it has spawned (or failed to)
function run(cmd, args) {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
        child.once('error', (err) => resolve({ ok: false, error: err.message, code: err.code }));
        child.once('spawn', () => { child.unref(); resolve({ ok: true }); });
    });
}

// Launch a program. target = shell command, executable path or .desktop file
ipcMain.handle('launch', async (e, target) => {
    if (!target || typeof target !== 'string') return { ok: false, error: 'no target given' };

    if (target.endsWith('.desktop')) {
        // gio handles Exec field codes, Terminal=true and so on; gtk-launch is the fallback
        const result = await run('gio', ['launch', target]);
        if (result.ok || result.code !== 'ENOENT') return result;
        return run('gtk-launch', [path.basename(target, '.desktop')]);
    }
    return run('/bin/sh', ['-c', target]);
});

// Installed applications, so the renderer can create a channel for each one
ipcMain.handle('list-apps', (e, skipIconIds) => listApps(skipIconIds));

// Log out: quitting WiiDesk ends the session (see session/wiidesk-session)
ipcMain.handle('logout', () => { app.quit(); });

// Open a website in the default browser (http/https only)
ipcMain.handle('open-site', async (e, url) => {
    try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http(s) allowed');
        await shell.openExternal(u.href);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
