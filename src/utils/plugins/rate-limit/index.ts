import Elysia from "elysia";
import {
  RateLimitOptions,
  RateLimitStore,
} from "../../../@types/plugins/rate-limit";
import { Console } from "../../console";

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

  // Use the provided store for tracking requests or initialize a new Map.
  const ipRequests: RateLimitStore = options.store || new Map();

  // Attach a pre-request handler to enforce rate limits.
  return new Elysia().onBeforeHandle(
    { as: options.scope },
    ({ request, set, path, server }) => {
      // Bypass rate limiting for paths specified in the skip list.
      if (options.skipPaths?.includes(path)) {
        if (options.verbose) {
          console.debug(`Skipping rate limit for path: ${path}`);
        }
        return;
      }

      // Set default rate limit values.
      let tierMax = options.max;
      let tierWindow = options.windowMs;

      // Adjust limits if tier-specific configurations exist.
      if (options.tiers) {
        for (const tier of options.tiers) {
          if (path.startsWith(tier.path)) {
            tierMax = tier.max || tierMax;
            tierWindow = tier.windowMs || tierWindow;
            if (options.verbose) {
              console.debug(
                `Tier applied for path ${path}: max=${tierMax}, window=${tierWindow}ms`
              );
            }
            break;
          }
        }
      }

      // Determine the client's IP address using a custom key generator if provided,
      // or fall back to standard header/server methods.
      let ip = options.keyGenerator
        ? options.keyGenerator(request, server)
        : request.headers.get("x-forwarded-for") ??
          server?.requestIP(request) ??
          "unknown";

      // If the IP is an object (e.g., with an address property), convert it to a string.
      if (typeof ip !== "string") {
        ip = ip.address;
      }

      // Use a regex to convert the IPv6 loopback address to "localhost" for local testing.
      ip = ip.replace(/^::1$/, "localhost");

      const now = Date.now();
      if (options.verbose) {
        console.debug(`Processing request from IP: ${ip}, Path: ${path}`);
      }

      // If this IP is not tracked yet, initialize its counter.
      if (!ipRequests.has(ip)) {
        if (options.verbose) {
          console.debug(`New client detected: ${ip}`);
        }
        ipRequests.set(ip, { count: 1, lastRequest: now });
        return;
      }

      // Retrieve the current request count and timestamp for this IP.
      const requestInfo = ipRequests.get(ip)!;

      // If the current window has expired, reset the count and update the timestamp.
      if (now - requestInfo.lastRequest > tierWindow!) {
        if (options.verbose) {
          console.debug(`Resetting counter for ${ip} due to expired window`);
        }
        requestInfo.count = 1;
        requestInfo.lastRequest = now;
        return;
      }

      // Increment the count for the IP.
      requestInfo.count += 1;
      if (options.verbose) {
        console.debug(
          `Request count for ${ip}: ${requestInfo.count}/${tierMax}`
        );
      }

      // Allow the request if the count is within the allowed limit.
      if (requestInfo.count <= tierMax!) {
        return;
      }

      // Log that the rate limit has been exceeded.
      if (options.verbose) {
        console.debug(`Rate limit exceeded for IP: ${ip}`);
      }

      // Set response headers with rate limit information if enabled.
      if (options.headers) {
        set.headers = {
          "X-RateLimit-Limit": String(tierMax),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(
            Math.ceil((requestInfo.lastRequest + tierWindow!) / 1000)
          ),
          "Retry-After": String(Math.ceil(tierWindow! / 1000)),
        };
      }

      // Set the HTTP status and return the rate limit exceeded message.
      set.status = options.statusCode!;
      return options.message;
    }
  );
};

export { rateLimitPlugin, type RateLimitOptions };
