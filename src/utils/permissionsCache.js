const NodeCache = require('node-cache');

const parseTtl = () => {
  const raw = Number.parseInt(process.env.PERMISSIONS_CACHE_TTL ?? '120', 10);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 120;
};

const ttl = parseTtl();

const cache = new NodeCache({
  stdTTL: ttl,
  checkperiod: Math.max(30, Math.floor(ttl / 2)),
  useClones: false,
});

const prefix = 'user-permissions:';

const buildKey = (userId) => `${prefix}${userId}`;

const getCachedPermissions = (userId) => {
  if (!userId) {
    return null;
  }
  const cached = cache.get(buildKey(userId));
  if (!cached) {
    return null;
  }
  if (cached instanceof Set) {
    return new Set(cached);
  }
  if (Array.isArray(cached)) {
    return new Set(cached);
  }
  return null;
};

const savePermissionsToCache = (userId, permissionsSet) => {
  if (!userId || !(permissionsSet instanceof Set)) {
    return;
  }
  cache.set(buildKey(userId), Array.from(permissionsSet));
};

const invalidatePermissionsCache = (userId) => {
  if (!userId) {
    return;
  }
  cache.del(buildKey(userId));
};

const flushPermissionsCache = () => cache.flushAll();

module.exports = {
  getCachedPermissions,
  savePermissionsToCache,
  invalidatePermissionsCache,
  flushPermissionsCache,
};
