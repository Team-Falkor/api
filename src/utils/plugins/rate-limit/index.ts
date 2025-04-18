import Elysia from "elysia";
import ms from "ms";
import { RateLimitOptions, RateLimitStore } from "../../../@types/plugins";
import { Console } from "../../console";
import { createResponse } from "../../response";

const console = new Console({ prefix: "[Rate Limit]:" });

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
  server: any,
  keyGenerator?: (req: Request, srv: any) => string
): string => {
  try {
    if (keyGenerator) {
      const key = keyGenerator(request, server);
      return typeof key === "string" ? key : "unknown";
    }

    let ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      (server?.requestIP && server.requestIP(request)) ||
      "unknown";

    if (ip && typeof ip === "object" && "address" in ip) {
      // @ts-ignore
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
      `Error extracting IP: ${err instanceof Error ? err.message : String(err)}`
    );
    return "unknown";
  }
};

export const rateLimitPlugin = (userOptions: RateLimitOptions = {}) => {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };

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
      case "fixed-window":
      default:
        ipRequests = new Map() as RateLimitStore;
        break;
    }
  }

  return new Elysia().onBeforeHandle(
    { as: options.scope },
    ({ request, set, path, server, error, headers }) => {
      if (request.method === "OPTIONS") {
        options.verbose && console.debug(`Skipping rate-limit for OPTIONS`);
        return;
      }

      if (options.debug) {
        options.verbose && console.debug(`Debug mode: skipping rate-limit`);
        return;
      }

      if (
        options.skipPaths?.some((p) =>
          p.includes("*")
            ? new RegExp("^" + p.replace(/\*/g, ".*") + "$").test(path)
            : p === path
        )
      ) {
        options.verbose &&
          console.debug(`Skipping rate-limit for path: ${path}`);
        return;
      }

      const method = request.method;
      let tierMax = options.max!;
      let tierWindow = options.windowMs!;

      if (options.tiers) {
        for (const tier of options.tiers) {
          if (
            path.startsWith(tier.path) &&
            (!tier.method || tier.method === "ALL" || tier.method === method)
          ) {
            tierMax = tier.max ?? tierMax;
            tierWindow = tier.windowMs ?? tierWindow;
            options.verbose &&
              console.debug(
                `Applying tier for ${path}: max=${tierMax}, window=${ms(
                  tierWindow
                )}`
              );
            break;
          }
        }
      }

      const clientId = getClientIdentifier(
        request,
        server,
        options.keyGenerator
      );
      const now = Date.now();
      let isRateLimited = false;
      let remaining = 0;
      let resetTime = 0;

      switch (options.algorithm) {
        case "token-bucket": {
          const store = ipRequests as TokenBucketStore;
          if (!store.has(clientId)) {
            store.set(clientId, {
              tokens: tierMax,
              lastRefill: now,
              lastRequest: now,
            });
            remaining = tierMax - 1;
            resetTime = now + tierWindow;
            break;
          }
          const bucket = store.get(clientId)!;
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
          if (!store.has(clientId)) {
            store.set(clientId, { requests: [now], lastRequest: now });
            remaining = tierMax - 1;
            resetTime = now + tierWindow;
            break;
          }
          const info = store.get(clientId)!;
          const windowStart = now - tierWindow;
          info.requests = info.requests.filter((t) => t >= windowStart);
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
        case "fixed-window":
        default: {
          const store = ipRequests as RateLimitStore;
          if (!store.has(clientId)) {
            store.set(clientId, { count: 1, lastRequest: now });
            remaining = tierMax - 1;
            resetTime = now + tierWindow;
            break;
          }
          const info = store.get(clientId)!;
          if (now - info.lastRequest > tierWindow) {
            info.count = 1;
            info.lastRequest = now;
            remaining = tierMax - 1;
            resetTime = now + tierWindow;
          } else {
            info.count++;
            if (info.count <= tierMax) {
              remaining = tierMax - info.count;
              resetTime = info.lastRequest + tierWindow;
            } else {
              remaining = 0;
              resetTime = info.lastRequest + tierWindow;
              isRateLimited = true;
            }
          }
          break;
        }
      }

      if (!isRateLimited) {
        if (options.headers) {
          set.headers["X-RateLimit-Limit"] = String(tierMax);
          set.headers["X-RateLimit-Remaining"] = String(remaining);
          set.headers["X-RateLimit-Reset"] = String(
            Math.ceil(resetTime / 1000)
          );
        }
        return;
      }

      options.verbose && console.debug(`Rate limit exceeded for ${clientId}`);

      if (options.headers) {
        set.headers["X-RateLimit-Limit"] = String(tierMax);
        set.headers["X-RateLimit-Remaining"] = "0";
        set.headers["X-RateLimit-Reset"] = String(Math.ceil(resetTime / 1000));
        set.headers["Retry-After"] = String(
          Math.ceil((resetTime - now) / 1000)
        );
      }

      set.status = options.statusCode!;
      return error(
        options.statusCode!,
        createResponse({
          message: options.message!,
          success: false,
          error: true,
        })
      );
    }
  );
};
