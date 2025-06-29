import { Elysia } from "elysia";
import type { CacheOptions, CacheValue } from "../@types";
import { Console } from "../utils/console";

class CacheStore<
	CacheMap extends Record<string, unknown> = Record<string, unknown>,
> {
	private cache: Map<string, CacheValue<unknown>>;
	private options: Required<CacheOptions>;
	private cleanupInterval: NodeJS.Timeout | null = null;
	private persistencePath: string | null = null;
	private persistenceEnabled: boolean = false;
	private saveTimeout: NodeJS.Timeout | null = null;
	private saveDelayMs: number = 500;

	constructor(options: CacheOptions = {}) {
		this.cache = new Map<string, CacheValue<unknown>>();
		this.options = {
			ttl: options.ttl ?? 0,
			namespace: options.namespace ?? "app",
			maxSize: options.maxSize ?? 1000,
			logLevel: options.logLevel ?? "error",
			persistencePath: options.persistencePath ?? "./cache.json",
			persistence: options.persistence ?? true,
		};

		this.persistenceEnabled =
			!!this.options.persistence && !!this.options.persistencePath;

		if (this.persistenceEnabled) {
			this.persistencePath = this.options.persistencePath;
			this.loadFromDisk().catch((e) => {
				this.log("error", `Initial load from disk failed: ${e}`);
			});
		}

		if (this.options.ttl > 0) {
			this.cleanupInterval = setInterval(() => {
				this.cleanup();
			}, 60 * 1000);
		}

		this.log(
			"info",
			`Cache initialized with options: ${JSON.stringify(this.options)}`,
		);
	}

	private async saveToDisk(): Promise<void> {
		if (!this.persistenceEnabled || !this.persistencePath) {
			this.log(
				"debug",
				"Persistence not enabled or path not set. Skipping save.",
			);
			return;
		}
		try {
			const dataToSave = Array.from(this.cache.entries());
			const data = JSON.stringify(dataToSave);
			await Bun.write(this.persistencePath, data);
			this.log("debug", `Cache persisted to ${this.persistencePath}`);
		} catch (e) {
			this.log(
				"error",
				`Failed to persist cache: ${e instanceof Error ? e.message : e}`,
			);
		}
	}

	private scheduleSave(): void {
		if (!this.persistenceEnabled) {
			this.log("debug", "Persistence not enabled. Skipping scheduleSave.");
			return;
		}
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(() => {
			this.saveToDisk().catch((e) => {
				this.log("error", `Debounced save failed: ${e}`);
			});
			this.saveTimeout = null;
		}, this.saveDelayMs);
		this.log("debug", `Scheduled cache save in ${this.saveDelayMs}ms`);
	}

	private async loadFromDisk(): Promise<void> {
		if (!this.persistenceEnabled || !this.persistencePath) {
			this.log(
				"debug",
				"Persistence not enabled or path not set. Skipping load.",
			);
			return;
		}
		try {
			const file = Bun.file(this.persistencePath);
			if (!(await file.exists())) {
				this.log(
					"info",
					`Cache file not found at ${this.persistencePath}. Starting with empty cache.`,
				);
				return;
			}
			const data = await file.text();
			const entries: [string, CacheValue<unknown>][] = JSON.parse(data);

			let loadedCount = 0;
			let expiredCount = 0;
			for (const [key, value] of entries) {
				if (!this.isExpired(value.expiry)) {
					this.cache.set(key, value);
					loadedCount++;
				} else {
					expiredCount++;
				}
			}
			this.log(
				"info",
				`Cache loaded from ${this.persistencePath}. Loaded ${loadedCount} entries, ${expiredCount} expired entries ignored.`,
			);
			this.enforceMaxSize();
		} catch (e) {
			this.log(
				"error",
				`Failed to load cache from ${this.persistencePath}: ${
					e instanceof Error ? e.message : e
				}`,
			);
			this.cache.clear();
			this.log("warn", "Cache cleared due to loading failure.");
		}
	}

	private validateKey(key: string): boolean {
		if (typeof key !== "string") {
			this.log("error", `Cache key must be a string, got: ${typeof key}`);
			return false;
		}
		return true;
	}

	set<K extends string & keyof CacheMap>(
		key: K,
		value: CacheMap[K],
		ttl?: number,
	): void {
		if (!this.validateKey(key)) {
			return;
		}

		const namespacedKey = this.getNamespacedKey(key);
		const expiry =
			ttl !== undefined
				? Date.now() + ttl * 1000
				: this.options.ttl > 0
					? Date.now() + this.options.ttl * 1000
					: null;

		this.cache.set(namespacedKey, { value, expiry } as CacheValue<unknown>);
		this.log(
			"debug",
			`Cache set: ${namespacedKey}, expires: ${
				expiry ? new Date(expiry).toISOString() : "never"
			}`,
		);

		this.enforceMaxSize();
		this.scheduleSave();
	}

	get<K extends string & keyof CacheMap, T = CacheMap[K]>(
		key: K,
	): T | undefined {
		if (!this.validateKey(key)) {
			return undefined;
		}

		const namespacedKey = this.getNamespacedKey(key);
		const cached = this.cache.get(namespacedKey);

		if (!cached) {
			this.log("debug", `Cache miss: ${namespacedKey}`);
			return undefined;
		}

		if (this.isExpired(cached.expiry)) {
			this.cache.delete(namespacedKey);
			this.log("debug", `Cache expired and removed: ${namespacedKey}`);
			this.scheduleSave();
			return undefined;
		}

		this.log("debug", `Cache hit: ${namespacedKey}`);
		return cached.value as T;
	}

	delete(key: string): boolean {
		if (!this.validateKey(key)) {
			return false;
		}

		const namespacedKey = this.getNamespacedKey(key);
		const result = this.cache.delete(namespacedKey);
		if (result) {
			this.log("debug", `Cache delete: ${namespacedKey}`);
			this.scheduleSave();
		}
		return result;
	}

	has(key: string): boolean {
		if (!this.validateKey(key)) {
			return false;
		}
		const namespacedKey = this.getNamespacedKey(key);
		const cached = this.cache.get(namespacedKey);
		return cached ? !this.isExpired(cached.expiry) : false;
	}

	clear(prefix?: string): void {
		if (prefix !== undefined && typeof prefix !== "string") {
			this.log(
				"error",
				`Prefix must be a string or undefined, got: ${typeof prefix}`,
			);
			return;
		}

		let count = 0;
		if (prefix) {
			const namespacedPrefix = this.getNamespacedKey(prefix);
			const keysToDelete: string[] = [];
			for (const key of this.cache.keys()) {
				if (key.startsWith(namespacedPrefix)) {
					keysToDelete.push(key);
				}
			}
			for (const key of keysToDelete) {
				this.cache.delete(key);
				count++;
			}
			if (count > 0) {
				this.log(
					"info",
					`Cleared ${count} cache entries with prefix: ${namespacedPrefix}`,
				);
				this.scheduleSave();
			} else {
				this.log(
					"info",
					`No cache entries found with prefix: ${namespacedPrefix} to clear.`,
				);
			}
		} else {
			count = this.cache.size;
			if (count > 0) {
				this.cache.clear();
				this.log("info", `Cleared all ${count} cache entries`);
				this.scheduleSave();
			} else {
				this.log("info", "Cache is already empty. Nothing to clear.");
			}
		}
	}

	getStats(): {
		size: number;
		maxSize: number;
		ttl: number | null;
		persistenceEnabled: boolean;
	} {
		return {
			size: this.cache.size,
			maxSize: this.options.maxSize,
			ttl: this.options.ttl > 0 ? this.options.ttl : null,
			persistenceEnabled: this.persistenceEnabled,
		};
	}

	async dispose(): Promise<void> {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}

		if (this.persistenceEnabled) {
			this.log("info", "Disposing cache. Saving final state...");
			await this.saveToDisk();
		}

		this.cache.clear();
		this.log("info", "Cache disposed");
	}

	private log(
		level: "none" | "error" | "warn" | "info" | "debug",
		message: string,
	): void {
		switch (level) {
			case "error":
				if (
					this.options.logLevel === "error" ||
					this.options.logLevel === "warn" ||
					this.options.logLevel === "info" ||
					this.options.logLevel === "debug"
				)
					Console.error(message);
				break;
			case "warn":
				if (
					this.options.logLevel === "warn" ||
					this.options.logLevel === "info" ||
					this.options.logLevel === "debug"
				)
					Console.warn(message);
				break;
			case "info":
				if (
					this.options.logLevel === "info" ||
					this.options.logLevel === "debug"
				)
					Console.info(message);
				break;
			case "debug":
				if (this.options.logLevel === "debug") Console.debug(message);
				break;
			case "none":
				break;
		}
	}

	private getNamespacedKey(key: string): string {
		return `${this.options.namespace}:${key}`;
	}

	private isExpired(expiry: number | null): boolean {
		return expiry !== null && Date.now() > expiry;
	}

	private cleanup(): void {
		const now = Date.now();
		let expiredCount = 0;
		for (const [key, value] of this.cache.entries()) {
			if (value.expiry !== null && now > value.expiry) {
				this.cache.delete(key);
				expiredCount++;
			}
		}
		if (expiredCount > 0) {
			this.log("debug", `Cleaned up ${expiredCount} expired cache entries`);
			this.scheduleSave();
		}
	}

	private enforceMaxSize(): void {
		if (this.cache.size <= this.options.maxSize) return;

		const entriesToRemove = this.cache.size - this.options.maxSize;
		this.log(
			"warn",
			`Cache size (${this.cache.size}) exceeded maximum (${this.options.maxSize}). Removing ${entriesToRemove} oldest entries.`,
		);

		let removedCount = 0;
		for (const key of this.cache.keys()) {
			if (removedCount < entriesToRemove) {
				this.cache.delete(key);
				removedCount++;
			} else {
				break;
			}
		}
		if (removedCount > 0) {
			this.scheduleSave();
		}
	}
}

export const cachePlugin = <
	CacheMap extends Record<string, unknown> = Record<string, unknown>,
>(
	options: CacheOptions = {},
) => {
	const store = new CacheStore<CacheMap>(options);

	return new Elysia({ name: "cache" })
		.decorate("cache", {
			set: <K extends string & keyof CacheMap>(
				key: K,
				value: CacheMap[K],
				ttl?: number,
			) => store.set(key, value, ttl),
			get: <K extends string & keyof CacheMap>(
				key: K,
			): CacheMap[K] | undefined => store.get(key),
			delete: (key: string): boolean => store.delete(key),
			has: (key: string): boolean => store.has(key),
			clear: (prefix?: string): void => store.clear(prefix),
			getStats: () => store.getStats(),
			middleware: <
				T = unknown,
				C extends { request: unknown; set: unknown } = {
					request: unknown;
					set: unknown;
				},
			>(
				key: string | ((context: C) => string),
				ttl?: number,
			) => {
				return async (context: C, next: () => Promise<T>) => {
					const cacheKey = typeof key === "function" ? key(context) : key;

					if (typeof cacheKey !== "string") {
						Console.log(
							`error: Cache middleware key function did not return a string, got: ${typeof cacheKey}`,
						);
						return await next();
					}

					const cached = store.get(cacheKey as string & keyof CacheMap) as
						| T
						| undefined;

					if (cached !== undefined) {
						return cached;
					}

					const response = await next();

					if (response !== undefined && response !== null) {
						store.set(
							cacheKey as string & keyof CacheMap,
							response as CacheMap[string & keyof CacheMap],
							ttl,
						);
					}

					return response;
				};
			},
		})
		.on("stop", async () => {
			await store.dispose();
		});
};
