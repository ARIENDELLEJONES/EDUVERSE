export function isGradeAdmin(user) {
  return user && (user.type === 'admin' || user.type === 'grade_admin');
}

export function getTeacherPermission(user, databaseId) {
  if (!user || user.type !== 'grade_teacher') return null;
  const perms = user.data?.permissions || [];
  return perms.find((p) => Number(p.database_id) === Number(databaseId));
}

export function canReadGradeDatabase(user, databaseId) {
  if (!databaseId) return true;
  if (isGradeAdmin(user)) return true;
  if (!user || user.type !== 'grade_teacher') return true;
  const perm = getTeacherPermission(user, databaseId);
  return perm && perm.access_level !== 'NO_ACCESS';
}

export function canWriteGradeDatabase(user, databaseId) {
  if (!databaseId) return false;
  if (isGradeAdmin(user)) return true;
  if (!user || user.type !== 'grade_teacher') return false;
  const perm = getTeacherPermission(user, databaseId);
  return perm && perm.access_level === 'EDIT';
}

export function requireGradeAdmin(req, res, next) {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!isGradeAdmin(req.user)) {
    res.status(403).json({ success: false, message: 'Admin only' });
    return;
  }
  next();
}

export function requireGradeWrite(getDatabaseId) {
  return (req, res, next) => {
    const databaseId = getDatabaseId(req);
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    if (!canWriteGradeDatabase(req.user, databaseId)) {
      res.status(403).json({ success: false, message: 'No edit access for this database' });
      return;
    }
    next();
  };
}

export function requireGradeRead(getDatabaseId) {
  return (req, res, next) => {
    const databaseId = getDatabaseId(req);
    if (!databaseId) {
      next();
      return;
    }
    if (!req.user) {
      next();
      return;
    }
    if (!canReadGradeDatabase(req.user, databaseId)) {
      res.status(403).json({ success: false, message: 'No access to this database' });
      return;
    }
    next();
  };
}
