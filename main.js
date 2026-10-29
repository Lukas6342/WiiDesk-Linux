const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

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

// Launch a program. target = shell command, executable path or .desktop file
ipcMain.handle('launch', (e, target) => {
    return new Promise((resolve) => {
        if (!target || typeof target !== 'string') return resolve({ ok: false, error: 'no target given' });

        let cmd, args;
        if (target.endsWith('.desktop')) {
            cmd = 'gtk-launch';
            args = [path.basename(target, '.desktop')];
        } else {
            cmd = '/bin/sh';
            args = ['-c', target];
        }

        const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
        child.once('error', (err) => resolve({ ok: false, error: err.message }));
        child.once('spawn', () => { child.unref(); resolve({ ok: true }); });
    });
});

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
