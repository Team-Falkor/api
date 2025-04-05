import type { CacheItem } from "@/@types";
import { Console } from "@/utils";
import ms from "ms";
import { SQLHelper } from "../sql";


export const console = new Console({
  prefix: "[Cache] ",
});

const debug = process.env.DEBUG === "true";

export class Cache<T = unknown> {
  private readonly cache: Map<string, CacheItem<T>> = new Map();
  private timerId: NodeJS.Timer | null = null;
  private readonly dbPath: string;
  private readonly db: SQLHelper;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new SQLHelper(dbPath, { create: true });
    this.initDatabase();
    this.loadCache();
  }

  // Initialize database schema
  private initDatabase(): void {
    try {
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS cache (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          ttl INTEGER NOT NULL
        )
      `);
      
      if (debug) {
        console.info(`Initialized cache database: ${this.dbPath}`);
      }
    } catch (error) {
      console.error(
        `Error initializing cache database (${this.dbPath}): ${(error as Error).message}`
      );
    }
  }

  // Load cache from database
  private async loadCache(): Promise<void> {
    try {
      const now = Date.now();
      this.cache.clear();
      
      // Query only non-expired items
      const result = this.db.query<{key: string, value: string, ttl: number}>(
        "SELECT key, value, ttl FROM cache WHERE ttl > ?", 
        [now]
      );

      for (const row of result.data) {
        try {
          const value = JSON.parse(row.value) as T;
          this.cache.set(row.key, { value, ttl: row.ttl });
        } catch (parseError) {
          console.error(`Error parsing cache value for key ${row.key}: ${(parseError as Error).message}`);
        }
      }

      if (debug) {
        console.info(
          `Loaded ${this.cache.size} items from cache database: ${this.dbPath}`
        );
      }
    } catch (error) {
      console.error(
        `Error loading cache from database (${this.dbPath}): ${
          (error as Error).message
        }`
      );
    }
  }

  // Save cache to database
  private async saveCache(): Promise<void> {
    if (this.cache.size === 0) {
      if (debug) {
        console.warn("Skipping save: Cache is empty.");
      }
      return; // Avoid database operations with an empty cache
    }

    try {
      // Use a transaction for better performance and data integrity
      this.db.transaction(() => {
        // First, delete expired items from the database
        const now = Date.now();
        this.db.execute("DELETE FROM cache WHERE ttl <= ?", [now]);
        
        // Then, insert or update each cache item
        for (const [key, item] of this.cache.entries()) {
          const valueStr = JSON.stringify(item.value);
          this.db.execute(
            "INSERT OR REPLACE INTO cache (key, value, ttl) VALUES (?, ?, ?)",
            [key, valueStr, item.ttl]
          );
        }
      });

      if (debug) {
        console.info(
          `Saved ${this.cache.size} items to cache database: ${this.dbPath}`
        );
      }
    } catch (error) {
      console.error(`Error saving cache to database (${this.dbPath}):`, error);
    }
  }

  // Get an item from the cache
  public get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) {
      // Try to get from database directly if not in memory
      const now = Date.now();
      const row = this.db.queryOne<{key: string, value: string, ttl: number}>(
        "SELECT key, value, ttl FROM cache WHERE key = ? AND ttl > ?", 
        [key, now]
      );
      
      if (row) {
        try {
          const value = JSON.parse(row.value) as T;
          this.cache.set(key, { value, ttl: row.ttl });
          if (debug) {
            console.info(`Cache hit from database: ${key}`);
          }
          return value;
        } catch (error) {
          console.error(`Error parsing cache value for key ${key}: ${(error as Error).message}`);
          return null;
        }
      }
      return null;
    }

    if (item.ttl && item.ttl < Date.now()) {
      if (debug) {
        console.info(`Cache item expired: ${key}`);
      }
      this.delete(key);
      return null;
    }

    if (debug) {
      console.info(`Cache hit: ${key}`);
    }
    return item.value;
  }

  // Set an item in the cache
  public set(key: string, value: T, ttl: string | number): void {
    const expirationTime =
      Date.now() + (typeof ttl === "string" ? ms(ttl) : ttl);
    this.cache.set(key, { value, ttl: expirationTime });
    
    // Update in database immediately
    try {
      const valueStr = JSON.stringify(value);
      this.db.execute(
        "INSERT OR REPLACE INTO cache (key, value, ttl) VALUES (?, ?, ?)",
        [key, valueStr, expirationTime]
      );
    } catch (error) {
      console.error(`Error setting cache in database for key ${key}: ${(error as Error).message}`);
    }

    if (debug) {
      console.info(`Cache set: ${key}, expires in ${ttl}`);
    }
  }

  // Delete a specific key from the cache
  public delete(key: string): void {
    const deleted = this.cache.delete(key);
    
    // Delete from database
    try {
      this.db.execute("DELETE FROM cache WHERE key = ?", [key]);
    } catch (error) {
      console.error(`Error deleting cache from database for key ${key}: ${(error as Error).message}`);
    }
    
    if (deleted && debug) {
      console.info(`Cache delete: ${key}`);
    }
  }

  // Clear the entire cache
  public clear(): void {
    this.cache.clear();
    
    // Clear database
    try {
      this.db.execute("DELETE FROM cache");
    } catch (error) {
      console.error(`Error clearing cache database: ${(error as Error).message}`);
    }
    
    if (debug) {
      console.info("Cache cleared");
    }
  }

  // Remove expired items
  private removeExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    // Find expired keys in memory cache
    for (const [key, { ttl }] of this.cache) {
      if (ttl && ttl < now) {
        expiredKeys.push(key);
      }
    }
    
    // Remove from memory cache
    expiredKeys.forEach((key) => this.cache.delete(key));
    
    // Remove from database
    try {
      this.db.execute("DELETE FROM cache WHERE ttl <= ?", [now]);
    } catch (error) {
      console.error(`Error removing expired items from database: ${(error as Error).message}`);
    }
    
    if (debug && expiredKeys.length > 0) {
      console.info(`Removed expired items: ${expiredKeys.length}`);
    }
  }

  // Get the current size of the cache
  public size(): number {
    return this.cache.size;
  }

  // Start periodic cleanup and save
  public startTimer(interval: number = 10000): void {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    this.timerId = setInterval(() => {
      this.removeExpired();
      this.saveCache();
    }, interval);

    if (debug) {
      console.info(`Cache timer started with interval: ${ms(interval)}`);
    }
  }

  // Stop periodic cleanup
  public stopTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      if (debug) {
        console.info("Cache timer stopped");
      }
    }
  }

  // Save and clean up on close
  public async close(): Promise<void> {
    this.stopTimer();
    await this.saveCache();
    this.db.close();
    if (debug) {
      console.info(`Cache closed and saved to database: ${this.dbPath}`);
    }
  }
}
