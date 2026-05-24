import db from '../db.js';

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    req.user = null;
    next();
    return;
  }

  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?')
    .get(token, Date.now());

  if (!session) {
    req.user = null;
    next();
    return;
  }

  req.user = {
    token,
    type: session.user_type,
    id: session.user_id,
    data: session.data ? JSON.parse(session.data) : {}
  };
  next();
}

export function requireAuth(roles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    if (roles && !roles.includes(req.user.type)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
