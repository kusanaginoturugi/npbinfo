const CACHE_PREFIX = 'npbinfo_api_cache_';
const DEFAULT_TTL = 60 * 60 * 1000; // 1時間
const PAST_YEAR_TTL = 7 * 24 * 60 * 60 * 1000; // 1週間（過去年度）

export const apiCache = {
  get(key) {
    try {
      const stored = localStorage.getItem(CACHE_PREFIX + key);
      if (!stored) return null;

      const { data, timestamp, ttl } = JSON.parse(stored);
      const isExpired = Date.now() - timestamp > ttl;

      if (isExpired) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return { data, timestamp };
    } catch (e) {
      console.error('Cache read error:', e);
      return null;
    }
  },

  set(key, data, year, ttlOverride) {
    try {
      const currentYear = new Date().getFullYear();
      // 過去年度なら長いTTL、今年度ならデフォルトのTTL
      const ttl = ttlOverride ?? (year < currentYear ? PAST_YEAR_TTL : DEFAULT_TTL);

      const cacheData = {
        data,
        timestamp: Date.now(),
        ttl,
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cacheData));
    } catch (e) {
      console.warn('Cache write error (possibly quota exceeded):', e);
    }
  },

  // 古いキャッシュを掃除する（念のため）
  clearExpired() {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(CACHE_PREFIX)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const { timestamp, ttl } = JSON.parse(stored);
            if (Date.now() - timestamp > ttl) {
              localStorage.removeItem(key);
            }
          }
        }
      });
    } catch (e) {
      // ignore
    }
  }
};
