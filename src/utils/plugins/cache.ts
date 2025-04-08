import { Elysia } from "elysia";
import type { CacheOptions, CacheValue } from "../../@types/plugins";
import { Console } from "../console";

const console = new Console({
  prefix: "[CACHE PLUGIN]: ",
  useTimestamp: false,
});

class CacheStore<
  CacheMap extends Record<string, unknown> = Record<string, unknown>
> {
  private cache: Map<string, CacheValue<unknown>>;
  private options: Required<CacheOptions>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map<string, CacheValue<unknown>>();
    this.options = {
      ttl: options.ttl ?? 0, // 0 means no expiry
      namespace: options.namespace ?? "app",
      maxSize: options.maxSize ?? 1000,
      logLevel: options.logLevel ?? "error",
    };

    // Start cleanup interval if TTL is set
    if (this.options.ttl > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000); // Cleanup every minute
    }

    this.log(
      "info",
      `Cache initialized with options: ${JSON.stringify(this.options)}`
    );
  }

  private log(
    level: "none" | "error" | "warn" | "info" | "debug",
    message: string
  ): void {
    if (level === "none" || this.options.logLevel === "none") return;

    const logLevels = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };
    if (logLevels[level] >= logLevels[this.options.logLevel]) {
      switch (level) {
        case "error":
          console.error(message);
          break;
        case "warn":
          console.warn(message);
          break;
        case "info":
          console.info(message);
          break;
        case "debug":
          console.debug(message);
          break;
      }
    }
  }

  private getNamespacedKey(key: string): string {
    return `${this.options.namespace}:${key}`;
  }

  private isExpired(expiry: number | null): boolean {
    if (expiry === null) return false;
    return Date.now() > expiry;
  }

  private cleanup(): void {
    let expiredCount = 0;
    for (const [key, value] of this.cache.entries()) {
      if (this.isExpired(value.expiry)) {
        this.cache.delete(key);
        expiredCount++;
      }
    }
    if (expiredCount > 0) {
      this.log("debug", `Cleaned up ${expiredCount} expired cache entries`);
    }
  }

  private enforceMaxSize(): void {
    if (this.cache.size <= this.options.maxSize) return;

    // Simple LRU implementation - remove oldest entries first
    const entriesToRemove = this.cache.size - this.options.maxSize;
    const keys = Array.from(this.cache.keys()).slice(0, entriesToRemove);

    for (const key of keys) {
      this.cache.delete(key);
    }

    this.log(
      "warn",
      `Cache size exceeded maximum. Removed ${entriesToRemove} oldest entries`
    );
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to store
   * @param ttl Optional TTL in seconds, overrides the default
   */
  set<K extends string & keyof CacheMap>(
    key: K,
    value: CacheMap[K],
    ttl?: number
  ): void {
    const namespacedKey = this.getNamespacedKey(key);
    const expiry =
      ttl !== undefined
        ? Date.now() + ttl * 1000
        : this.options.ttl > 0
        ? Date.now() + this.options.ttl * 1000
        : null;

    this.cache.set(namespacedKey, { value, expiry } as CacheValue<unknown>);
    this.enforceMaxSize();

    this.log(
      "debug",
      `Cache set: ${namespacedKey}, expires: ${
        expiry ? new Date(expiry).toISOString() : "never"
      }`
    );
  }

  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns The cached value or undefined if not found or expired
   */
  get<K extends string & keyof CacheMap, T = CacheMap[K]>(
    key: K
  ): T | undefined {
    const namespacedKey = this.getNamespacedKey(key);
    const cached = this.cache.get(namespacedKey);

    if (!cached) {
      this.log("debug", `Cache miss: ${namespacedKey}`);
      return undefined;
    }

    if (this.isExpired(cached.expiry)) {
      this.cache.delete(namespacedKey);
      this.log("debug", `Cache expired: ${namespacedKey}`);
      return undefined;
    }

    this.log("debug", `Cache hit: ${namespacedKey}`);
    return cached.value as T;
  }

  /**
   * Delete a value from the cache
   * @param key Cache key
   * @returns true if the key was found and deleted, false otherwise
   */
  delete(key: string): boolean {
    const namespacedKey = this.getNamespacedKey(key);
    const result = this.cache.delete(namespacedKey);

    if (result) {
      this.log("debug", `Cache delete: ${namespacedKey}`);
    }

    return result;
  }

  /**
   * Check if a key exists in the cache and is not expired
   * @param key Cache key
   * @returns true if the key exists and is not expired, false otherwise
   */
  has(key: string): boolean {
    const namespacedKey = this.getNamespacedKey(key);
    const cached = this.cache.get(namespacedKey);

    if (!cached || this.isExpired(cached.expiry)) {
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries or entries with a specific prefix
   * @param prefix Optional prefix to clear only matching keys
   */
  clear(prefix?: string): void {
    if (prefix) {
      const namespacedPrefix = this.getNamespacedKey(prefix);
      let count = 0;

      for (const key of this.cache.keys()) {
        if (key.startsWith(namespacedPrefix)) {
          this.cache.delete(key);
          count++;
        }
      }

      this.log(
        "info",
        `Cleared ${count} cache entries with prefix: ${namespacedPrefix}`
      );
    } else {
      const count = this.cache.size;
      this.cache.clear();
      this.log("info", `Cleared all ${count} cache entries`);
    }
  }

  /**
   * Get cache stats
   * @returns Object with cache statistics
   */
  getStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      ttl: this.options.ttl,
    };
  }

  /**
   * Dispose the cache store and clear any intervals
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    this.log("info", "Cache disposed");
  }
}

/**
 * Cache plugin for Elysia
 * @param options Cache options
 * @returns Elysia plugin with cache functionality
 */
export const cachePlugin = <
  CacheMap extends Record<string, unknown> = Record<string, unknown>
>(
  options: CacheOptions = {}
) => {
  const store = new CacheStore<CacheMap>(options);

  return new Elysia({ name: "cache" })
    .decorate("cache", {
      /**
       * Set a value in the cache
       * @param key Cache key
       * @param value Value to store
       * @param ttl Optional TTL in seconds, overrides the default
       */
      set: <K extends string & keyof CacheMap>(
        key: K,
        value: CacheMap[K],
        ttl?: number
      ) => store.set(key, value, ttl),

      /**
       * Get a value from the cache
       * @param key Cache key
       * @returns The cached value or undefined if not found or expired
       */
      get: <K extends string & keyof CacheMap>(
        key: K
      ): CacheMap[K] | undefined => store.get(key),

      /**
       * Delete a value from the cache
       * @param key Cache key
       * @returns true if the key was found and deleted, false otherwise
       */
      delete: (key: string): boolean => store.delete(key),

      /**
       * Check if a key exists in the cache and is not expired
       * @param key Cache key
       * @returns true if the key exists and is not expired, false otherwise
       */
      has: (key: string): boolean => store.has(key),

      /**
       * Clear all cache entries or entries with a specific prefix
       * @param prefix Optional prefix to clear only matching keys
       */
      clear: (prefix?: string): void => store.clear(prefix),

      /**
       * Get cache stats
       * @returns Object with cache statistics
       */
      getStats: () => store.getStats(),

      /**
       * Create a middleware that caches the response of a route
       * @param key Cache key or function that returns a cache key
       * @param ttl Optional TTL in seconds, overrides the default
       */
      middleware: <
        T = unknown,
        C extends { request: unknown; set: unknown } = {
          request: unknown;
          set: unknown;
        }
      >(
        key: string | ((context: C) => string),
        ttl?: number
      ) => {
        return async (context: C, next: () => Promise<T>) => {
          const cacheKey = typeof key === "function" ? key(context) : key;
          const cached = store.get(cacheKey as string & keyof CacheMap) as
            | T
            | undefined;

          if (cached) {
            return cached;
          }

          const response = await next();
          store.set(
            cacheKey as string & keyof CacheMap,
            response as CacheMap[string & keyof CacheMap],
            ttl
          );

          return response;
        };
      },
    })
    .on("stop", () => {
      store.dispose();
    });
};
