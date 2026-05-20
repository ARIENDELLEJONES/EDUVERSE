const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;
let splashWindow;

const PORT = 3000;
const APP_ROOT = path.join(__dirname, '..');

function waitForServer(url, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - start > timeout) reject(new Error('Server startup timed out'));
      else setTimeout(check, 500);
    };
    check();
  });
}

function startServerInProcess() {
  // Set environment variables BEFORE importing the server
  // Use app.getPath('userData') for writable data directory on all platforms
  // On Windows the install dir (Program Files) is often read-only
  const userDataDir = app.getPath('userData');
  process.env.EDUVERSE_DATA_DIR = path.join(userDataDir, 'data');
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(PORT);

  // Dynamic import() loads the ES module server directly in the Electron main process
  // This avoids all child process issues (fork, ELECTRON_RUN_AS_NODE, native module mismatches)
  const serverUrl = 'file:///' + path.join(APP_ROOT, 'server', 'index.js').split(path.sep).join('/');
  return import(serverUrl)
    .then(() => {
      console.log('[EDUVERSE] Server module loaded successfully');
    })
    .catch((err) => {
      console.error('[EDUVERSE] Failed to load server module:', err);
      showErrorInWindow('Failed to start server: ' + (err.message || String(err)));
    });
}

function showErrorInWindow(message) {
  const safeMsg = String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const errorHtml = '<!DOCTYPE html><html><body style="background:#0a0a1a;color:#fff;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
    '<div style="text-align:center;max-width:500px;padding:2rem">' +
    '<h1 style="color:#fd79a8;font-size:2rem;margin-bottom:1rem">EDUVERSE — Server Error</h1>' +
    '<p style="color:#ddd;margin-bottom:1rem">' + safeMsg + '</p>' +
    '<p style="color:#888;font-size:0.85rem">Try closing and reopening the application.</p>' +
    '<p style="color:#555;font-size:0.75rem;margin-top:1rem">If the problem persists, delete the app data folder and reinstall.</p>' +
    '</div></body></html>';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL('data:text/html,' + encodeURIComponent(errorHtml));
    mainWindow.show();
  } else if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.loadURL('data:text/html,' + encodeURIComponent(errorHtml));
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500, height: 350, frame: false, transparent: true,
    resizable: false, alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  const splashHtml = '<!DOCTYPE html><html><head><style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{background:transparent;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}' +
    '.splash{background:linear-gradient(135deg,#0a0a1a 0%,#1a0a2e 50%,#0a1a2e 100%);border-radius:20px;padding:3rem;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid rgba(108,92,231,0.3)}' +
    'h1{font-size:2.5rem;font-weight:800;background:linear-gradient(135deg,#6c5ce7,#00cec9);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:0.5rem}' +
    '.sub{color:#a0a0b0;font-size:0.9rem;margin-bottom:1.5rem}' +
    '.author{color:#666;font-size:0.75rem;margin-top:1rem}' +
    '.loader{display:flex;gap:6px;justify-content:center;margin-top:1rem}' +
    '.loader span{width:10px;height:10px;border-radius:50%;background:#6c5ce7;animation:bounce 1.4s infinite ease-in-out both}' +
    '.loader span:nth-child(1){animation-delay:-0.32s}.loader span:nth-child(2){animation-delay:-0.16s}' +
    '@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}' +
    '.status{color:#00cec9;font-size:0.85rem;margin-top:1rem}' +
    '</style></head><body>' +
    '<div class="splash"><h1>EDUVERSE</h1>' +
    '<p class="sub">Hybrid LAN + Cloud Educational Platform</p>' +
    '<p class="status">Starting server...</p>' +
    '<div class="loader"><span></span><span></span><span></span></div>' +
    '<p class="author">by JOSEPH BRYLLE D. EGAY | 2026</p>' +
    '</div></body></html>';
  splashWindow.loadURL('data:text/html,' + encodeURIComponent(splashHtml));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 600,
    show: false,
    title: 'EDUVERSE — Hybrid Educational Platform',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  mainWindow.loadURL('http://localhost:' + PORT);

  mainWindow.webContents.on('did-finish-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL('http://localhost:' + PORT);
      }
    }, 2000);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  createSplashWindow();
  await startServerInProcess();
  try {
    await waitForServer('http://localhost:' + PORT + '/api/health');
    createWindow();
  } catch (err) {
    console.error('[EDUVERSE] Server failed to respond:', err.message);
    showErrorInWindow('Server failed to start within 60 seconds. Try restarting the application.');
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
