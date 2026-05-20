// CJS bootstrap for Electron packaged builds
// Electron's fork() uses the Electron binary, which needs ELECTRON_RUN_AS_NODE=1
// This CJS file uses dynamic import() to load the ES module server
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import('./index.js').catch(err => {
  console.error('Failed to start EDUVERSE server:', err);
  process.exit(1);
});
