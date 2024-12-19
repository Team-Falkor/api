import type { CacheItem } from "@/@types";
import { Console } from "@/utils";
import { readFile, writeFile } from "fs/promises";
import ms from "ms";

export const console = new Console({
  prefix: "[Cache] ",
});

const debug = process.env.DEBUG === "true";

export class Cache<T = unknown> {
  private readonly cache: Map<string, CacheItem<T>> = new Map();
  private timerId: NodeJS.Timer | null = null;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.loadCache();
  }

  // Load cache from file
  private async loadCache(): Promise<void> {
    try {
      const data = await readFile(this.filePath, "utf-8").catch(() => "[]");
      const parsed: [string, CacheItem<T>][] = JSON.parse(data);

      if (!Array.isArray(parsed)) {
        throw new Error("Invalid cache format. Expected an array.");
      }

      const now = Date.now();
      this.cache.clear();
      for (const [key, item] of parsed) {
        if (item.ttl > now) {
          this.cache.set(key, item);
        }
      }

      if (debug) {
        console.info(
          `Loaded ${this.cache.size} items from cache: ${this.filePath}`
        );
      }
    } catch (error) {
      console.error(
        `Error loading cache from file (${this.filePath}): ${
          (error as Error).message
        }`
      );
    }
  }

  // Save cache to file
  private async saveCache(): Promise<void> {
    if (this.cache.size === 0) {
      if (debug) {
        console.warn("Skipping save: Cache is empty.");
      }
      return; // Avoid overwriting with an empty state
    }

    try {
      const data = JSON.stringify(Array.from(this.cache.entries()));
      await writeFile(this.filePath, data, { encoding: "utf-8" });

      if (debug) {
        console.info(
          `Saved ${this.cache.size} items to cache: ${this.filePath}`
        );
      }
    } catch (error) {
      console.error(`Error saving cache to file (${this.filePath}):`, error);
    }
  }

  // Get an item from the cache
  public get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

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

    if (debug) {
      console.info(`Cache set: ${key}, expires in ${ttl}`);
    }
  }

  // Delete a specific key from the cache
  public delete(key: string): void {
    if (this.cache.delete(key) && debug) {
      console.info(`Cache delete: ${key}`);
    }
  }

  // Clear the entire cache
  public clear(): void {
    this.cache.clear();
    if (debug) {
      console.info("Cache cleared");
    }
  }

  // Remove expired items
  private removeExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    for (const [key, { ttl }] of this.cache) {
      if (ttl && ttl < now) {
        expiredKeys.push(key);
      }
    }
    expiredKeys.forEach((key) => this.cache.delete(key));
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
    if (debug) {
      console.info(`Cache closed and saved to file: ${this.filePath}`);
    }
  }
}
