// @ts-nocheck
import path from 'path';
import fs from 'fs';
import os from 'os';
import express from 'express';
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
import performanceRoutes from './routes/performance.js';

export function setupEduverse(app: any): void {
  initDatabase();

  const DATA_DIR = process.env.EDUVERSE_DATA_DIR || path.join(process.cwd(), 'data');
  const quizMediaDir = path.join(DATA_DIR, 'quiz-media');
  fs.mkdirSync(quizMediaDir, { recursive: true });

  app.use(compression());

  // Serve built React frontend static assets (before API routes for performance)
  const frontendPath = process.env.FRONTEND_PATH;
  if (frontendPath && fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
  }

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
  app.use('/api/performance', performanceRoutes);

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

  // Serve frontend static files when EDUVERSE_STATIC_DIR is set
  const staticDir = process.env.EDUVERSE_STATIC_DIR;
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }

  // SPA catch-all: must come AFTER all API routes so /api/* is not intercepted
  if (frontendPath && fs.existsSync(frontendPath)) {
    app.get('{*path}', (_req: any, res: any) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  } else if (staticDir && fs.existsSync(staticDir)) {
    app.get('{*path}', (_req: any, res: any) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }
}
