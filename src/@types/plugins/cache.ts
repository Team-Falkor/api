export type CacheValue<T> = {
  value: T;
  expiry: number | null; // Timestamp when the cache expires, null for no expiry
};

export type CacheOptions = {
  ttl?: number; // Time to live in seconds, default is no expiry
  namespace?: string; // Namespace for cache keys to avoid collisions
  maxSize?: number; // Maximum number of items in cache
  logLevel?: "none" | "error" | "warn" | "info" | "debug";
  persistencePath?: string;
  persistence?: boolean;
};

export interface Cache<CacheMap extends Record<string, unknown>> {
  set<K extends string & keyof CacheMap>(
    key: K,
    value: CacheMap[K],
    ttl?: number
  ): void;
  get<K extends string & keyof CacheMap, T = CacheMap[K]>(
    key: K
  ): T | undefined;
  delete(key: string): boolean;
  has(key: string): boolean;
  clear(prefix?: string): void;
  getStats(): { size: number; maxSize: number; ttl: number };
  middleware<
    T = unknown,
    C extends { request: unknown; set: unknown } = {
      request: unknown;
      set: unknown;
    }
  >(
    key: string | ((context: C) => string),
    ttl?: number
  ): (context: C, next: () => Promise<T>) => Promise<T>;
}
