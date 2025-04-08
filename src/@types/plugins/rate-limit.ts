import { LifeCycleType } from "elysia";

export type RateLimitStore = Map<
  string,
  { count: number; lastRequest: number }
>;

export interface RateLimitOptions {
  /** Scope */
  scope?: LifeCycleType;
  /** Time window in milliseconds */
  windowMs?: number;
  /** Maximum number of requests allowed in the time window */
  max?: number;
  /** Custom message to return when rate limit is exceeded */
  message?: string;
  /** HTTP status code to return when rate limit is exceeded */
  statusCode?: number;
  /** Skip rate limiting for certain paths */
  skipPaths?: string[];
  /** Enable detailed logging */
  verbose?: boolean;
  /** Custom key generator function */
  keyGenerator?: (request: Request, server: any) => string;
  /** Custom store implementation */
  store?: RateLimitStore;
  /** Headers to include in the response */
  headers?: boolean;
  /** Tiered rate limits for different paths */
  tiers?: Array<{
    path: string;
    windowMs?: number;
    max?: number;
  }>;
}
