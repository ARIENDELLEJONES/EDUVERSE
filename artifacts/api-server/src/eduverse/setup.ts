// @ts-nocheck
import path from 'path';
import fs from 'fs';
import os from 'os';
import compression from 'compression';
import { initDatabase } from './db.js';
import { cacheMiddleware } from './middleware/cache.js';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import gradesRoutes from './routes/grades.js';
import quizRoutes from './routes/quiz.js';
import backupRoutes from './routes/backup.js';
import studentsRoutes from './routes/students.js';
import livegameRoutes from './routes/livegame.js';
import adminRoutes from './routes/admin.js';

export function setupEduverse(app: any): void {
  initDatabase();

  const DATA_DIR = process.env.EDUVERSE_DATA_DIR || path.join(process.cwd(), 'data');
  const quizMediaDir = path.join(DATA_DIR, 'quiz-media');
  fs.mkdirSync(quizMediaDir, { recursive: true });

  app.use(compression());

  app.use('/uploads/quiz-media', (req: any, res: any, next: any) => {
    const filePath = path.join(quizMediaDir, req.path);
    if (fs.existsSync(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.sendFile(filePath);
    } else {
      next();
    }
  });

  app.use('/api', cacheMiddleware);
  app.use(authMiddleware);

  app.use('/api/auth', authRoutes);
  app.use('/api/grades', gradesRoutes);
  app.use('/api/quiz', quizRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/students', studentsRoutes);
  app.use('/api/livegame', livegameRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/api/system/info', (_req: any, res: any) => {
    const nets = os.networkInterfaces();
    const addresses: string[] = [];
    for (const name of Object.keys(nets || {})) {
      for (const net of (nets![name] || [])) {
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(`http://${net.address}`);
        }
      }
    }
    res.json({
      appName: 'EDUVERSE',
      version: '1.0.0',
      author: 'JOSEPH BRYLLE D. EGAY',
      year: 2026,
      lanAddresses: addresses,
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: process.uptime()
    });
  });
}
