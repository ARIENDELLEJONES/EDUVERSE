import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export function cacheMiddleware(req, res, next) {
  if (req.method !== 'GET') {
    next();
    return;
  }

  // Live game endpoints are real-time and must never be cached.
  if (req.originalUrl.startsWith('/api/livegame')) {
    next();
    return;
  }

  const key = req.originalUrl;
  const cached = cache.get(key);
  if (cached) {
    res.json(cached);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (data) => {
    cache.set(key, data);
    originalJson(data);
  };
  next();
}

export function invalidateCache(pattern) {
  const keys = cache.keys();
  for (const key of keys) {
    if (key.includes(pattern)) {
      cache.del(key);
    }
  }
}

export function clearAllCache() {
  cache.flushAll();
}

export { cache };
