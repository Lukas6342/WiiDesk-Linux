const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { listApps } = require('./desktop-apps');

let win = null;

// The Home key (Super, bound in session/openbox-rc.xml) runs session/wiidesk-home,
// which finds this process through the pid file and sends it SIGUSR2.
const PIDFILE = path.join(process.env.XDG_RUNTIME_DIR || '/tmp', `wiidesk-${process.getuid()}.pid`);

function showHomeMenu() {
    if (!win) return;
    // Tell the renderer whether an app was in front, so it can return there when the menu closes
    const overApp = !win.isFocused();
    win.show();
    win.focus();
    win.webContents.send('home-button', overApp);
}

// While WiiDesk is minimized behind an app, bring it back as soon as that app has quit
// (otherwise the screen would stay empty). Counts the windows the window manager manages.
let emptyDesktopTimer = null;
function watchForEmptyDesktop() {
    clearInterval(emptyDesktopTimer);
    emptyDesktopTimer = setInterval(() => {
        // isMinimized() is unreliable under X11, so stop once WiiDesk has the focus again
        if (!win || win.isFocused()) return clearInterval(emptyDesktopTimer);
        execFile('obxprop', ['--root', '_NET_CLIENT_LIST'], (err, out) => {
            if (err || !win || win.isFocused()) return;
            // Output looks like: _NET_CLIENT_LIST(WINDOW) = 4194307, 16777228
            const ids = (out.split('=')[1] || '').split(',').filter((id) => id.trim());
            if (ids.length <= 1) {
                win.restore();
                win.show();
                win.focus();
            }
        });
    }, 1000);
}

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

// The pause menu was closed: go back to the app it was opened over
ipcMain.handle('home-closed', (e, overApp) => {
    if (!overApp || !win) return;
    win.minimize();
    watchForEmptyDesktop();
});

process.on('SIGUSR2', showHomeMenu);

app.whenReady().then(() => {
    try { fs.writeFileSync(PIDFILE, String(process.pid)); } catch (e) { console.error('pid file:', e.message); }
    createWindow();
});
app.on('will-quit', () => { try { fs.unlinkSync(PIDFILE); } catch (e) {} });
app.on('window-all-closed', () => app.quit());
