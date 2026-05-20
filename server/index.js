import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';

import { initDatabase } from './db.js';
import { cacheMiddleware } from './middleware/cache.js';
import authRoutes from './routes/auth.js';
import gradesRoutes from './routes/grades.js';
import quizRoutes from './routes/quiz.js';
import backupRoutes from './routes/backup.js';
import studentsRoutes from './routes/students.js';
import livegameRoutes from './routes/livegame.js';
import adminRoutes from './routes/admin.js';
import { authMiddleware } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

initDatabase();

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api', cacheMiddleware);
app.use(authMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/grades', gradesRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/livegame', livegameRoutes);
app.use('/api/admin', adminRoutes);

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.use('/legacy', express.static(path.join(__dirname, '..', 'public', 'legacy')));

app.get('/api/system/info', (req, res) => {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ interface: name, address: net.address });
      }
    }
  }
  res.json({
    appName: 'EDUVERSE',
    version: '1.0.0',
    author: 'JOSEPH BRYLLE D. EGAY',
    year: 2026,
    port: PORT,
    lanAddresses: addresses.map(a => `http://${a.address}:${PORT}`),
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({ message: 'EDUVERSE API Server Running', port: PORT });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  console.log(`\n  EDUVERSE Server running on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  LAN:     http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(`\n  Students can connect via WiFi at the LAN address above.\n`);
});

export default app;
