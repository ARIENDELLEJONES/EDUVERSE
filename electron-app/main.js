const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { pathToFileURL } = require('url');

const SERVER_PORT = 5000;
const isDev = !app.isPackaged;

let tray = null;
let mainWindow = null;
let serverReady = false;

function getResourcePath(...parts) {
  if (isDev) {
    return path.join(__dirname, '..', ...parts);
  }
  return path.join(process.resourcesPath, ...parts);
}

function getServerScript() {
  return getResourcePath('server', 'index.mjs');
}

function getFrontendPath() {
  return getResourcePath('frontend');
}

function startServer() {
  return new Promise(async (resolve) => {
    const serverScript = getServerScript();
    const frontendPath = getFrontendPath();
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'eduverse.db');

    // Ensure userData dir exists
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

    // Set environment variables BEFORE importing the server module
    process.env.PORT = String(SERVER_PORT);
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_PATH = dbPath;
    process.env.EDUVERSE_DATA_DIR = userDataPath;
    process.env.FRONTEND_PATH = frontendPath;

    try {
      // Import the server module directly in-process
      const serverUrl = pathToFileURL(serverScript).href;
      await import(serverUrl);
      serverReady = true;
      resolve(true);
    } catch (err) {
      // If direct import fails, try polling (server might have started before error)
      let elapsed = 0;
      const poll = setInterval(async () => {
        elapsed += 500;
        try {
          await new Promise((res, rej) => {
            const req = http.get(`http://localhost:${SERVER_PORT}/api/quiz/list`, (r) => {
              if (r.statusCode < 500) { serverReady = true; resolve(true); res(); }
              else rej();
            });
            req.on('error', rej);
            req.setTimeout(800, () => { req.destroy(); rej(); });
          });
          clearInterval(poll);
        } catch {
          if (elapsed >= 10000) {
            clearInterval(poll);
            dialog.showErrorBox('EDUVERSE — Server Error', `Could not start server:\n${err.message}\n\n${err.stack || ''}`);
            resolve(false);
          }
        }
      }, 500);
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  const img = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('EDUVERSE');

  const menu = Menu.buildFromTemplate([
    { label: 'Open EDUVERSE', click: openApp },
    { label: 'Open in Browser', click: () => shell.openExternal(`http://localhost:${SERVER_PORT}`) },
    { type: 'separator' },
    { label: 'Quit EDUVERSE', click: () => { mainWindow = null; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', openApp);
}

function openApp() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'EDUVERSE',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => mainWindow && mainWindow.loadURL(`http://localhost:${SERVER_PORT}`), 1000);
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('before-quit', () => {
  app.isQuiting = true;
});

app.on('window-all-closed', () => {
  // Keep running in system tray on Windows
});

app.on('activate', openApp);

app.whenReady().then(async () => {
  createTray();

  const loading = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0d0d1a',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  loading.loadURL(`data:text/html,
    <html><body style="margin:0;background:#0d0d1a;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#fff">
      <h2 style="color:#00cec9;letter-spacing:4px;margin-bottom:8px">EDUVERSE</h2>
      <p style="color:#888;font-size:13px">Starting server, please wait...</p>
      <div style="width:200px;height:4px;background:#222;border-radius:4px;margin-top:16px;overflow:hidden">
        <div id="bar" style="height:100%;width:0%;background:linear-gradient(90deg,#6c5ce7,#00cec9);border-radius:4px;animation:prog 12s linear forwards"></div>
      </div>
      <style>@keyframes prog{to{width:95%}}</style>
    </body></html>
  `);

  const ready = await startServer();
  loading.close();

  if (!ready) {
    dialog.showErrorBox('EDUVERSE — Startup Failed', 'The server could not start. Please check your installation and try again.');
    app.quit();
    return;
  }

  createWindow();
});
