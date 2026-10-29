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
            // Der Renderer nutzt require('electron') und require('fs') direkt (script.js, storage.js)
            nodeIntegration: true,
            contextIsolation: false,
            autoplayPolicy: 'no-user-gesture-required'
        }
    });

    win.setMenu(null);
    win.loadFile(path.join(__dirname, 'index.html'));

    win.on('blur', () => win.webContents.send('window-blur'));
    win.on('focus', () => win.webContents.send('window-focus'));

    // Notausgang: Strg+Alt+Q beendet WiiDesk
    win.webContents.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && input.control && input.alt && input.key.toLowerCase() === 'q') {
            app.quit();
        }
    });

    win.on('closed', () => { win = null; });
}

// App/Programm starten. target = Befehl, Pfad oder .desktop-Datei
ipcMain.handle('launch', (e, target) => {
    return new Promise((resolve) => {
        if (!target || typeof target !== 'string') return resolve({ ok: false, error: 'kein Ziel angegeben' });

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

// Website im Standardbrowser öffnen
ipcMain.handle('open-site', async (e, url) => {
    try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('nur http(s) erlaubt');
        await shell.openExternal(u.href);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
