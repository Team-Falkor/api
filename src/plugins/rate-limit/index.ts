import Elysia from "elysia";
import type { Server } from "elysia/dist/universal/server";
import ms from "ms";
import type { RateLimitOptions, RateLimitStore } from "@/@types";
import { createApiResponse } from "@/utils";
import { buildSkipMatcher, skipMatcher } from "./buildSkipMatcher";

const DEFAULT_OPTIONS: RateLimitOptions = {
	windowMs: 60_000,
	max: 10,
	message: "Too many requests, please try again later.",
	statusCode: 429,
	skipPaths: [],
	verbose: true,
	headers: true,
	scope: "global",
	algorithm: "fixed-window",
	debug: false,
};

type TokenBucketStore = Map<
	string,
	{ tokens: number; lastRefill: number; lastRequest: number }
>;

type SlidingWindowStore = Map<
	string,
	{ requests: number[]; lastRequest: number }
>;

const getClientIdentifier = (
	request: Request,
	server: Server | null,
	keyGenerator?: (req: Request, srv: Server | null) => string,
): string => {
	try {
		if (keyGenerator) {
			const key = keyGenerator(request, server);
			return typeof key === "string" ? key : "unknown";
		}

		let ip =
			request.headers.get("x-forwarded-for") ||
			request.headers.get("x-real-ip") ||
			server?.requestIP?.(request) ||
			"unknown";

		if (ip && typeof ip === "object" && "address" in ip) {
			ip = ip.address;
		}

		if (typeof ip === "string") {
			ip = ip.replace(/^::1$/, "localhost");
			if (ip.includes(",")) {
				ip = ip.split(",")[0].trim();
			}
			return ip;
		}

		return "unknown";
	} catch (err) {
		console.error(
			`Error extracting IP: ${err instanceof Error ? err.message : String(err)}`,
		);
		return "unknown";
	}
};

export const rateLimitPlugin = (userOptions: RateLimitOptions = {}) => {
	const options = { ...DEFAULT_OPTIONS, ...userOptions };

	// Pre-compile skip matcher for better performance
	const shouldSkip = buildSkipMatcher(options.skipPaths);

	// Pre-compile tier matchers if tiers exist
	const tierMatchers = options.tiers?.map((tier) => ({
		...tier,
		matcher: skipMatcher(tier.path),
	}));

	let ipRequests: RateLimitStore | TokenBucketStore | SlidingWindowStore;
	if (options.store) {
		ipRequests = options.store;
	} else {
		switch (options.algorithm) {
			case "token-bucket":
				ipRequests = new Map() as TokenBucketStore;
				break;
			case "sliding-window":
				ipRequests = new Map() as SlidingWindowStore;
				break;
			default:
				ipRequests = new Map() as RateLimitStore;
				break;
		}
	}

	return new Elysia().onBeforeHandle(
		{ as: options.scope },
		({ request, set, path, server, error }) => {
			// Fast early returns
			if (request.method === "OPTIONS") {
				options.verbose && console.debug(`Skipping rate-limit for OPTIONS`);
				return;
			}

			if (options.debug) {
				options.verbose && console.debug(`Debug mode: skipping rate-limit`);
				return;
			}

			// Use pre-compiled skip matcher
			if (shouldSkip(path)) {
				options.verbose &&
					console.debug(`Skipping rate-limit for path: ${path}`);
				return;
			}

			const method = request.method;
			let tierMax = options.max ?? DEFAULT_OPTIONS.max ?? 10;
			let tierWindow = options.windowMs ?? DEFAULT_OPTIONS.windowMs ?? 60000;

			// Use pre-compiled tier matchers for better performance
			if (tierMatchers) {
				for (const tier of tierMatchers) {
					if (
						tier.matcher(path) &&
						(!tier.method || tier.method === "ALL" || tier.method === method)
					) {
						tierMax = tier.max ?? tierMax;
						tierWindow = tier.windowMs ?? tierWindow;
						options.verbose &&
							console.debug(
								`Applying tier for ${path}: max=${tierMax}, window=${ms(
									tierWindow,
								)}`,
							);
						break;
					}
				}
			}

			const clientId = getClientIdentifier(
				request,
				server,
				options.keyGenerator,
			);
			const now = Date.now();
			let isRateLimited = false;
			let remaining = 0;
			let resetTime = 0;

			switch (options.algorithm) {
				case "token-bucket": {
					const store = ipRequests as TokenBucketStore;
					let bucket = store.get(clientId);

					if (!bucket) {
						bucket = {
							tokens: tierMax - 1, // Already consuming one token
							lastRefill: now,
							lastRequest: now,
						};
						store.set(clientId, bucket);
						remaining = bucket.tokens;
						resetTime = now + tierWindow;
						break;
					}

					const elapsed = now - bucket.lastRefill;
					const rate = tierMax / tierWindow;
					const refill = Math.floor(elapsed * rate);

					if (refill > 0) {
						bucket.tokens = Math.min(tierMax, bucket.tokens + refill);
						bucket.lastRefill = now;
					}

					if (bucket.tokens > 0) {
						bucket.tokens--;
						remaining = bucket.tokens;
						resetTime = now + Math.ceil(1 / rate);
					} else {
						remaining = 0;
						resetTime = bucket.lastRefill + Math.ceil(1 / rate);
						isRateLimited = true;
					}
					bucket.lastRequest = now;
					break;
				}
				case "sliding-window": {
					const store = ipRequests as SlidingWindowStore;
					let info = store.get(clientId);
					const windowStart = now - tierWindow;

					if (!info) {
						info = { requests: [now], lastRequest: now };
						store.set(clientId, info);
						remaining = tierMax - 1;
						resetTime = now + tierWindow;
						break;
					}

					// Optimize: only filter if we have requests and some might be expired
					if (info.requests.length > 0 && info.requests[0] < windowStart) {
						// Use binary search to find first valid request for better performance
						let left = 0,
							right = info.requests.length;
						while (left < right) {
							const mid = Math.floor((left + right) / 2);
							if (info.requests[mid] >= windowStart) {
								right = mid;
							} else {
								left = mid + 1;
							}
						}
						info.requests = info.requests.slice(left);
					}

					if (info.requests.length < tierMax) {
						info.requests.push(now);
						remaining = tierMax - info.requests.length;
						resetTime = info.requests[0] + tierWindow;
						info.lastRequest = now;
					} else {
						remaining = 0;
						resetTime = info.requests[0] + tierWindow;
						isRateLimited = true;
					}
					break;
				}
				default: {
					const store = ipRequests as RateLimitStore;
					let info = store.get(clientId);

					if (!info) {
						info = { count: 1, lastRequest: now };
						store.set(clientId, info);
						remaining = tierMax - 1;
						resetTime = now + tierWindow;
						break;
					}

					const windowExpired = now - info.lastRequest > tierWindow;
					if (windowExpired) {
						info.count = 1;
						info.lastRequest = now;
						remaining = tierMax - 1;
						resetTime = now + tierWindow;
					} else {
						info.count++;
						const withinLimit = info.count <= tierMax;
						remaining = withinLimit ? tierMax - info.count : 0;
						resetTime = info.lastRequest + tierWindow;
						isRateLimited = !withinLimit;
					}
					break;
				}
			}

			// Set headers once for both success and rate-limited cases
			if (options.headers) {
				const resetTimeSeconds = Math.ceil(resetTime / 1000);
				set.headers["X-RateLimit-Limit"] = String(tierMax);
				set.headers["X-RateLimit-Remaining"] = String(remaining);
				set.headers["X-RateLimit-Reset"] = String(resetTimeSeconds);

				if (isRateLimited) {
					set.headers["Retry-After"] = String(
						Math.ceil((resetTime - now) / 1000),
					);
				}
			}

			if (!isRateLimited) {
				return;
			}

			options.verbose && console.debug(`Rate limit exceeded for ${clientId}`);

			const statusCode =
				options.statusCode ?? DEFAULT_OPTIONS.statusCode ?? 429;
			set.status = statusCode;
			return error(
				statusCode,
				createApiResponse({
					message:
						options.message ??
						DEFAULT_OPTIONS.message ??
						"Too many requests, please try again later.",
					success: false,
					error: true,
				}),
			);
		},
	);
};
