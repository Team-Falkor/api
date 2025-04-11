import Elysia from "elysia";
import ms from "ms";
import {
  RateLimitOptions,
  RateLimitStore,
  RateLimitTier,
} from "../../../@types/plugins/rate-limit";
import { Console } from "../../console";
import { createResponse } from "../../response";

// Initialize a console logger with a custom prefix for rate limit logs.
const console = new Console({ prefix: "[Rate Limit]: " });

// Default settings for the rate limiter.
const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60000, // Duration of the rate limit window in milliseconds (1 minute)
  max: 10, // Maximum number of requests allowed per window
  message: "Too many requests, please try again later.", // Message to return when rate limit is exceeded
  statusCode: 429, // HTTP status code for rate limit responses
  skipPaths: [], // List of URL paths to exclude from rate limiting
  verbose: true, // Enable detailed logging for debugging purposes
  headers: true, // Include rate limit information in response headers
  scope: "global", // Identifier for the middleware scope
  algorithm: "fixed-window", // Default rate limiting algorithm
  debug: false, // Debug mode disabled by default
};

// Extended store type for token bucket algorithm
type TokenBucketStore = Map<
  string,
  { tokens: number; lastRefill: number; lastRequest: number }
>;

// Extended store type for sliding window algorithm
type SlidingWindowStore = Map<
  string,
  { requests: Array<number>; lastRequest: number }
>;

/**
 * Safely extracts the client IP address from the request
 *
 * @param request - The incoming HTTP request
 * @param server - The server instance
 * @param keyGenerator - Optional custom function to generate a unique key
 * @returns A string representing the client's IP address
 */
const getClientIdentifier = (
  request: Request,
  server: any,
  keyGenerator?: (request: Request, server: any) => string
): string => {
  try {
    // Use custom key generator if provided
    if (keyGenerator) {
      const key = keyGenerator(request, server);
      return typeof key === "string" ? key : "unknown";
    }

    // Try to get IP from standard headers
    let ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      (server?.requestIP && server.requestIP(request)) ||
      "unknown";

    // Handle IP object format
    if (
      typeof ip !== "string" &&
      ip !== null &&
      typeof ip === "object" &&
      "address" in ip
    ) {
      ip = ip.address;
    }

    // Normalize IP address
    if (typeof ip === "string") {
      // Convert IPv6 loopback to localhost
      ip = ip.replace(/^::1$/, "localhost");
      // Take first IP if multiple are provided (common in x-forwarded-for)
      if (ip.includes(",")) {
        ip = ip.split(",")[0].trim();
      }
      return ip;
    }

    return "unknown";
  } catch (error) {
    console.error(
      `Error extracting client IP: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return "unknown";
  }
};

/**
 * Creates a rate limiting middleware for the Elysia framework.
 *
 * @param userOptions - Custom configuration options to override the defaults.
 * @returns An instance of the Elysia middleware configured for rate limiting.
 */
const rateLimitPlugin = (userOptions: RateLimitOptions = {}) => {
  // Combine user-provided options with the default settings.
  const options = { ...DEFAULT_OPTIONS, ...userOptions };

  // Initialize the appropriate store based on the algorithm
  let ipRequests: RateLimitStore | TokenBucketStore | SlidingWindowStore;

  // Use the provided store or initialize a new one based on the algorithm
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

  // Attach a pre-request handler to enforce rate limits.
  return new Elysia().onBeforeHandle(
    { as: options.scope },
    ({ request, set, path, server, error }) => {
      // Skip rate limiting if in debug mode
      if (options.debug === true) {
        if (options.verbose) {
          console.debug(
            `Debug mode enabled, skipping rate limit for all requests`
          );
        }
        return;
      }

      // Bypass rate limiting for paths specified in the skip list.
      if (
        options.skipPaths?.some((skipPath) => {
          // Support exact match or wildcard patterns
          if (skipPath.includes("*")) {
            const pattern = new RegExp(
              "^" + skipPath.replace(/\*/g, ".*") + "$"
            );
            return pattern.test(path);
          }
          return skipPath === path;
        })
      ) {
        if (options.verbose) {
          console.debug(`Skipping rate limit for path: ${path}`);
        }
        return;
      }

      // Get request method
      const method = request.method;

      // Set default rate limit values.
      let tierMax = options.max;
      let tierWindow = options.windowMs;
      let matchedTier: RateLimitTier | null = null;

      // Adjust limits if tier-specific configurations exist.
      if (options.tiers) {
        for (const tier of options.tiers) {
          if (path.startsWith(tier.path)) {
            // Check if the method matches or if tier.method is ALL or undefined
            if (
              !tier.method ||
              tier.method === "ALL" ||
              tier.method === method
            ) {
              tierMax = tier.max || tierMax;
              tierWindow = tier.windowMs || tierWindow;
              matchedTier = tier;
              if (options.verbose) {
                console.debug(
                  `Tier applied for path ${path} (${method}): max=${tierMax}, window=${tierWindow}ms`
                );
              }
              break;
            }
          }
        }
      }

      // Get client identifier (IP or custom key)
      const clientId = getClientIdentifier(
        request,
        server,
        options.keyGenerator
      );
      const now = Date.now();

      if (options.verbose) {
        console.debug(
          `Processing request from client: ${clientId}, Path: ${path}, Method: ${method}`
        );
      }

      // Apply the appropriate rate limiting algorithm
      let isRateLimited = false;
      let remaining = 0;
      let resetTime = 0;

      switch (options.algorithm) {
        case "token-bucket": {
          // Token bucket implementation
          const tokenStore = ipRequests as TokenBucketStore;

          if (!tokenStore.has(clientId)) {
            // Initialize new client with full token bucket
            tokenStore.set(clientId, {
              tokens: tierMax!,
              lastRefill: now,
              lastRequest: now,
            });
            remaining = tierMax! - 1;
            resetTime = now + tierWindow!;
            return;
          }

          const bucket = tokenStore.get(clientId)!;

          // Calculate token refill based on time passed
          const timePassed = now - bucket.lastRefill;
          const refillRate = tierMax! / tierWindow!;
          const tokensToAdd = Math.floor(timePassed * refillRate);

          // Refill tokens up to max capacity
          if (tokensToAdd > 0) {
            bucket.tokens = Math.min(tierMax!, bucket.tokens + tokensToAdd);
            bucket.lastRefill = now;
          }

          // Check if we have tokens available
          if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            bucket.lastRequest = now;
            remaining = bucket.tokens;
            // Calculate time until next token is available
            resetTime = now + Math.ceil(1 / refillRate);
            isRateLimited = false;
          } else {
            // Calculate time until next token is available
            resetTime = bucket.lastRefill + Math.ceil(1 / refillRate);
            remaining = 0;
            isRateLimited = true;
          }
          break;
        }

        case "sliding-window": {
          // Sliding window implementation
          const windowStore = ipRequests as SlidingWindowStore;

          if (!windowStore.has(clientId)) {
            // Initialize new client with this request timestamp
            windowStore.set(clientId, {
              requests: [now],
              lastRequest: now,
            });
            remaining = tierMax! - 1;
            resetTime = now + tierWindow!;
            return;
          }

          const windowInfo = windowStore.get(clientId)!;
          const windowStart = now - tierWindow!;

          // Remove timestamps outside the current window
          windowInfo.requests = windowInfo.requests.filter(
            (time) => time >= windowStart
          );

          // Check if we're under the limit
          if (windowInfo.requests.length < tierMax!) {
            // Add current request timestamp
            windowInfo.requests.push(now);
            windowInfo.lastRequest = now;
            remaining = tierMax! - windowInfo.requests.length;
            // Calculate reset time based on oldest request + window
            resetTime =
              windowInfo.requests.length > 0
                ? windowInfo.requests[0] + tierWindow!
                : now + tierWindow!;
            isRateLimited = false;
          } else {
            // Calculate when the oldest request will expire
            resetTime = windowInfo.requests[0] + tierWindow!;
            remaining = 0;
            isRateLimited = true;
          }
          break;
        }

        case "fixed-window":
        default: {
          // Fixed window implementation (original algorithm)
          const fixedStore = ipRequests as RateLimitStore;

          if (!fixedStore.has(clientId)) {
            if (options.verbose) {
              console.debug(`New client detected: ${clientId}`);
            }
            fixedStore.set(clientId, { count: 1, lastRequest: now });
            remaining = tierMax! - 1;
            resetTime = now + tierWindow!;
            return;
          }

          const requestInfo = fixedStore.get(clientId)!;

          // If the current window has expired, reset the count
          if (now - requestInfo.lastRequest > tierWindow!) {
            if (options.verbose) {
              console.debug(
                `Resetting counter for ${clientId} due to expired window`
              );
            }
            requestInfo.count = 1;
            requestInfo.lastRequest = now;
            remaining = tierMax! - 1;
            resetTime = now + tierWindow!;
            return;
          }

          // Increment the count
          requestInfo.count += 1;
          if (options.verbose) {
            console.debug(
              `Request count for ${clientId}: ${
                requestInfo.count
              }/${tierMax} (Window: ${ms(tierWindow ?? 0)})`
            );
          }

          // Check if we're under the limit
          if (requestInfo.count <= tierMax!) {
            remaining = tierMax! - requestInfo.count;
            resetTime = requestInfo.lastRequest + tierWindow!;
            isRateLimited = false;
          } else {
            remaining = 0;
            resetTime = requestInfo.lastRequest + tierWindow!;
            isRateLimited = true;
          }
          break;
        }
      }

      // Allow the request if not rate limited
      if (!isRateLimited) {
        // Set headers with rate limit information if enabled
        if (options.headers) {
          set.headers = {
            "X-RateLimit-Limit": String(tierMax),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(Math.ceil(resetTime / 1000)),
          };
        }
        return;
      }

      // Log that the rate limit has been exceeded.
      if (options.verbose) {
        console.debug(`Rate limit exceeded for client: ${clientId}`);
      }

      // Set response headers with rate limit information if enabled.
      if (options.headers) {
        set.headers = {
          "X-RateLimit-Limit": String(tierMax),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(resetTime / 1000)),
          "Retry-After": String(Math.ceil((resetTime - now) / 1000)),
        };
      }

      // Set the HTTP status and return the rate limit exceeded message.
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

export { rateLimitPlugin, type RateLimitOptions };
