import type { CacheItem } from "@/@types";
import ms from "ms";

const debug = Bun.env.DEBUG === "true";

export class Cache<T = any> {
  static instance: Cache;
  private readonly cache: Map<string, CacheItem<T>> = new Map();
  private timerId: NodeJS.Timer | null = null;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.loadFromFile();
  }

  // Load cache from the file
  private async loadFromFile(): Promise<void> {
    try {
      const data = Bun.file(this.filePath);
      if (!(await data.exists())) {
        console.log(`Cache file ${this.filePath} not found, creating new one`);
        Bun.write(this.filePath, "[]");
      }
      const parsed: [string, CacheItem<T>][] = await data.json();
      const now = Date.now();
      this.cache.clear();
      for (const [key, item] of parsed) {
        if (item.ttl > now) {
          this.cache.set(key, item);
        }
      }

      if (debug) {
        console.log(
          `Loaded ${this.cache.size} items from cache file ${this.filePath}`
        );
      }
    } catch (error) {
      console.error("Failed to load cache from file:", error);
    }
  }

  // Save cache to the file
  private async saveToFile(): Promise<void> {
    try {
      const data = JSON.stringify(Array.from(this.cache.entries()));
      await Bun.write(this.filePath, data);
      if (debug) {
        console.log(
          `Saved ${this.cache.size} items to cache file ${this.filePath}`
        );
      }
    } catch (error) {
      console.error("Failed to save cache to file:", error);
    }
  }

  // Retrieves an item from the cache
  public get(key: string): T | null {
    const item = this.cache.get(key);
    if (item) {
      if (debug) {
        console.log(`Cache item ${key} found`);
      }
      if (item.ttl && item.ttl < Date.now()) {
        if (debug) {
          console.log(`Cache item ${key} expired`);
        }
        this.delete(key); // Expired, delete it
        return null;
      }
      return item.value;
    }
    return null;
  }

  // Sets an item in the cache
  public set(key: string, value: T, ttl: number): void {
    const expirationTime = Date.now() + ttl;
    this.cache.set(key, { value, ttl: expirationTime });
  }

  // Deletes a specific key from the cache
  public delete(key: string): void {
    this.cache.delete(key);
  }

  // Clears the entire cache
  public clear(): void {
    this.cache.clear();
  }

  // Removes expired items from the cache
  private removeExpired(): void {
    const now = Date.now();
    for (const [key, { ttl }] of this.cache) {
      if (ttl && ttl < now) {
        this.cache.delete(key);
      }
    }
  }

  // Returns the number of items in the cache
  public size(): number {
    return this.cache.size;
  }

  // Starts a timer to periodically remove expired items and save to file
  public startTimer(interval = 10000): void {
    if (this.timerId) {
      clearInterval(this.timerId); // Ensure only one interval is active
    }
    this.timerId = setInterval(() => {
      this.removeExpired();
      this.saveToFile();
    }, interval);
    if (debug) {
      console.log(`Started timer with interval ${ms(interval)}`);
    }
  }

  // Stops the timer if it is running
  public stopTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      if (debug) {
        console.log("Stopped timer");
      }
    }
  }

  // Ensures cache is saved to file when the process exits
  public async close(): Promise<void> {
    this.stopTimer();
    await this.saveToFile();
    if (debug) {
      console.log(`Closed cache, saved to file ${this.filePath}`);
    }
  }
}
