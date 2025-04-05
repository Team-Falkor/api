import { dbPath } from "@/main"; // Keep dbPath import
import crypto from "node:crypto"; // Keep crypto import
import fs from "node:fs"; // Keep fs import
import path from "node:path"; // Keep path import
import { Console } from "../../utils/console"; // Keep Console import
import { SQLHelper } from "../sql"; // Keep SQLHelper import

export interface RateLimitEntry {
  ipHash: string;
  endpoint: string;
  count: number;
  lastRequest: number;
  blocked: number; // 0 or 1
}

// Keep AuditLogEntry definition here as getAuditLogs is now here
export interface AuditLogEntry {
  id?: number;
  timestamp: number;
  maskedIp: string;
  action: string;
  details: string;
  success: number; // Store as 0 or 1 in DB
}

export class RateLimit {
  private sql: SQLHelper;
  private logger = new Console({ prefix: "RateLimit" });

  // Rate limiting configuration
  private rateLimitWindow = 60 * 1000; // 1 minute in milliseconds
  private maxRequestsPerWindow = 10; // Maximum requests per window per endpoint
  private blockDuration = 10 * 60 * 1000; // 10 minutes in milliseconds
  private suspiciousActivityThreshold = 5; // Number of failed attempts before logging suspicious activity

  // Security configuration
  private secretKey: string =
    process.env.IP_SECRET_KEY ||
    Bun.env.IP_SECRET_KEY ||
    "default-secret-key-please-change";
  private logLevel: "debug" | "info" | "warn" | "error" = (process.env
    .LOG_LEVEL ||
    Bun.env.LOG_LEVEL ||
    "info") as any;
  private securityLogFile: string | null =
    process.env.SECURITY_LOG_FILE || Bun.env.SECURITY_LOG_FILE || null;

  // Track suspicious activity
  private suspiciousIPs: Map<string, number> = new Map();

  constructor() {
    this.sql = new SQLHelper(dbPath, { create: true });
    this.initTables(); // Renamed to plural as it initializes multiple tables
    this.validateSecretKey();
    this.logger.info("RateLimit and AuditLog service initialized");
  }

  /**
   * Initialize rate limiting and audit log tables if they don't exist
   */
  private initTables(): void {
    // Rate Limit Table
    const rateLimitQuery = `
            CREATE TABLE IF NOT EXISTS rate_limits (
                ipHash TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                count INTEGER NOT NULL,
                lastRequest INTEGER NOT NULL,
                blocked INTEGER NOT NULL DEFAULT 0, -- Use INTEGER 0/1 for boolean
                PRIMARY KEY (ipHash, endpoint)
            )
        `;
    this.sql.execute(rateLimitQuery);
    this.logger.debug("Rate limit table checked/created.");

    // Audit Log Table
    const auditLogQuery = `
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                maskedIp TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                success INTEGER NOT NULL -- Use INTEGER 0/1 for boolean
            )
        `;
    this.sql.execute(auditLogQuery);
    this.logger.debug("Audit log table checked/created.");

    // Add index to audit_log table for faster querying by timestamp and action
    const auditIndexQuery = `CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp_action ON audit_log (timestamp DESC, action)`;
    this.sql.execute(auditIndexQuery);
    this.logger.debug("Audit log index checked/created.");
  }

  /**
   * Validate the secret key used for IP hashing
   */
  private validateSecretKey(): void {
    const isProduction =
      process.env.NODE_ENV === "production" ||
      Bun.env.NODE_ENV === "production";

    if (isProduction && this.secretKey === "default-secret-key-please-change") {
      this.logger.error(
        "SECURITY RISK: Using default secret key in production environment! Set IP_SECRET_KEY env variable."
      );
    }

    if (this.secretKey.length < 16) {
      this.logger.warn(
        "Secret key is too short (< 16 chars). Consider using a longer, random key for IP_SECRET_KEY."
      );
    }
  }

  /**
   * Compute a deterministic hash of an IP address using HMAC-SHA256
   */
  private hashIP(ip: string): string {
    // Normalize localhost IPs
    if (ip === "::1" || ip === "::ffff:127.0.0.1") ip = "127.0.0.1";
    const hmac = crypto.createHmac("sha256", this.secretKey);
    hmac.update(ip);
    return hmac.digest("hex");
  }

  /**
   * Mask an IP address for logging with enhanced privacy protection.
   * Made public so other classes (like Providers) can use it for consistent masking.
   */
  public maskIP(ip: string): string {
    if (!ip || ip === "unknown" || ip === "system") {
      return ip || "unknown"; // Return 'system' if that was the input
    }

    try {
      // IPv4
      if (ip.includes(".") && !ip.includes(":")) {
        // More robust check for IPv4
        const parts = ip.split(".");
        if (
          parts.length === 4 &&
          parts.every(
            (part) =>
              /^\d+$/.test(part) &&
              parseInt(part, 10) >= 0 &&
              parseInt(part, 10) <= 255
          )
        ) {
          return `${parts[0]}.${parts[1]}.xxx.xxx`;
        }
      }
      // IPv6
      else if (ip.includes(":")) {
        // Basic IPv6 masking, can be improved
        const parts = ip.split(":");
        if (parts.length > 2) {
          // Mask last parts, or a portion if collapsed :: is used
          const maskCount = Math.max(2, Math.floor(parts.length / 2));
          return (
            parts.slice(0, parts.length - maskCount).join(":") +
            ":xxxx".repeat(maskCount)
          );
        }
      }

      // Fallback for unrecognized formats or short strings
      if (ip.length > 8) {
        return `${ip.substring(0, 3)}...${ip.substring(ip.length - 3)}`;
      } else if (ip.length > 3) {
        return `${ip.substring(0, 2)}...`;
      }

      return "xxx"; // Default mask if too short or weird format
    } catch (error) {
      this.logger.error(
        `Error masking IP (${ip}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return "xxx.xxx.xxx.xxx"; // Fallback mask on error
    }
  }

  /**
   * Add an entry to the audit log with enhanced details.
   * Only the masked IP is stored. (Moved from Providers)
   */
  public addAuditLog(
    ip: string,
    action: string,
    details: string,
    success: boolean
  ): void {
    try {
      // Ignore logging for 'system' actions unless debugging
      if (ip === "system" && this.logLevel !== "debug") {
        return;
      }

      const timestamp = Date.now();
      const maskedIp = this.maskIP(ip); // Use the internal maskIP

      // Add request ID for correlation across logs (optional, useful for debugging)
      // const requestId = crypto.randomBytes(4).toString('hex');

      // Truncate details if too long to prevent excessive storage/log spam
      const maxDetailsLength = 512;
      const truncatedDetails =
        details.length > maxDetailsLength
          ? details.substring(0, maxDetailsLength) + "..."
          : details;

      // Store in database
      const query = `INSERT INTO audit_log (timestamp, maskedIp, action, details, success) VALUES (?, ?, ?, ?, ?)`;
      this.sql.execute(query, [
        timestamp,
        maskedIp,
        action,
        truncatedDetails,
        success ? 1 : 0,
      ]);

      // Log to console with appropriate level
      if (
        this.logLevel === "debug" ||
        !success ||
        action.startsWith("SECURITY_") ||
        action.includes("ERROR")
      ) {
        const logMethod = success ? "info" : "warn";
        // this.logger[logMethod](`AUDIT [${requestId}] ${action} | IP: ${maskedIp} | ${success ? 'SUCCESS' : 'FAILED'} | ${truncatedDetails}`);
        this.logger[logMethod](
          `AUDIT | ${action} | IP: ${maskedIp} | ${
            success ? "SUCCESS" : "FAILED"
          } | ${truncatedDetails}`
        );
      }

      // Track suspicious activity for failed actions (only for non-system IPs)
      if (!success && ip !== "system") {
        this.trackSuspiciousActivity(ip, action);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error adding audit log entry: ${errorMessage}`);
    }
  }

  /**
   * Log security events with severity levels.
   * Optionally writes to a dedicated security log file. (Moved from Providers)
   */
  public logSecurityEvent(
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    ip: string,
    event: string,
    attempted: boolean
  ): void {
    try {
      const timestamp = new Date().toISOString();
      // Mask IP using the internal method, handles 'system' case
      const maskedIp = this.maskIP(ip);
      const logMessage = `[SECURITY:${severity}] ${timestamp} | IP: ${maskedIp} | Event: ${event} | ${
        attempted ? "Attempted" : "Detected"
      }`;

      // Always log to console with appropriate level
      if (severity === "CRITICAL" || severity === "HIGH") {
        this.logger.error(logMessage);
      } else if (severity === "MEDIUM") {
        this.logger.warn(logMessage);
      } else {
        this.logger.info(logMessage); // Log LOW severity as info
      }

      // Log to security file if configured
      if (this.securityLogFile) {
        try {
          // Ensure directory exists (simple check)
          const logDir = path.dirname(path.resolve(this.securityLogFile));
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          fs.appendFileSync(
            path.resolve(this.securityLogFile),
            `${logMessage}\n`,
            { encoding: "utf-8" }
          );
        } catch (fileError) {
          this.logger.error(
            `Failed to write to security log file (${this.securityLogFile}): ${
              fileError instanceof Error ? fileError.message : String(fileError)
            }`
          );
          // Prevent logging loops, disable file logging temporarily if it fails repeatedly? (more complex)
        }
      }

      // Add to audit log for database record (always log security events regardless of success/failure concept)
      // Use a specific action format like SECURITY_ACTION
      this.addAuditLog(ip, `SECURITY_${severity}`, event, false); // Log as success=false in audit DB
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Avoid infinite loops if logging itself fails
      console.error(`CRITICAL: Error logging security event: ${errorMessage}`);
    }
  }

  /**
   * Track suspicious activity from an IP address
   */
  private trackSuspiciousActivity(ip: string, endpoint: string): void {
    // Do not track system or unknown IPs
    if (ip === "unknown" || ip === "system") return;

    const ipHash = this.hashIP(ip); // Hash the actual IP for tracking
    const key = `${ipHash}:${endpoint}`; // Track per IP *and* endpoint
    const currentCount = this.suspiciousIPs.get(key) || 0;
    const newCount = currentCount + 1;

    this.suspiciousIPs.set(key, newCount);

    // Simple cleanup mechanism: remove old entries periodically (e.g., every few minutes)
    // This prevents the map from growing indefinitely. A more robust solution might use TTL caches.
    if (Math.random() < 0.01) {
      // Roughly 1% chance on each call to trigger cleanup
      this.cleanupSuspiciousIPs();
    }

    // Log when thresholds are met
    if (newCount === this.suspiciousActivityThreshold) {
      this.logger.warn(
        `Suspicious activity threshold (${
          this.suspiciousActivityThreshold
        }) reached for ${this.maskIP(ip)} on ${endpoint}`
      );
      this.logSecurityEvent(
        "MEDIUM",
        ip,
        `Suspicious activity threshold reached on ${endpoint}`,
        true
      );
    } else if (newCount >= this.suspiciousActivityThreshold * 2) {
      // Log higher severity for repeated offenses and potentially reset count to avoid spamming logs
      this.logger.error(
        `Continued suspicious activity (${newCount} attempts) from ${this.maskIP(
          ip
        )} on ${endpoint}`
      );
      this.logSecurityEvent(
        "HIGH",
        ip,
        `Continued suspicious activity (${newCount} attempts) on ${endpoint}`,
        true
      );
      // Optionally reset the count here to prevent constant HIGH logs for the same IP/endpoint after threshold hit
      // this.suspiciousIPs.set(key, 0);
    }
  }

  /**
   * Basic cleanup for the suspicious IPs map (can be called periodically)
   */
  private cleanupSuspiciousIPs(): void {
    const now = Date.now();
    // Example: Remove entries older than, say, 1 hour (adjust as needed)
    // This requires storing timestamp along with count, making the map more complex.
    // For simplicity here, we'll just clear the map if it gets too large.
    const maxSize = 10000;
    if (this.suspiciousIPs.size > maxSize) {
      this.logger.warn(`Suspicious IP map size exceeded ${maxSize}, clearing.`);
      this.suspiciousIPs.clear();
    }
  }

  /**
   * Check rate limits for a given IP and endpoint with enhanced security monitoring.
   * Returns whether the request is allowed. (Previously in Providers, now refined here)
   */
  public checkRateLimit(
    ip: string,
    endpoint: string
  ): { allowed: boolean; error?: string } {
    // Bypass for 'system' IP
    if (ip === "system") {
      return { allowed: true };
    }
    // Immediately reject 'unknown' IP if configured to do so (more secure)
    if (ip === "unknown") {
      this.logSecurityEvent(
        "MEDIUM",
        "unknown",
        `Attempted access from unknown IP on ${endpoint}`,
        true
      );
      return { allowed: false, error: "Access denied." };
    }

    try {
      const now = Date.now();
      const windowStart = now - this.rateLimitWindow;
      const ipHash = this.hashIP(ip); // Use the hashed IP for DB operations

      const query = `SELECT ipHash, endpoint, count, lastRequest, blocked FROM rate_limits WHERE ipHash = ? AND endpoint = ?`;
      const result = this.sql.queryOne<RateLimitEntry>(query, [
        ipHash,
        endpoint,
      ]);

      if (!result) {
        // First request for this IP/endpoint combination
        const insertQuery = `INSERT INTO rate_limits (ipHash, endpoint, count, lastRequest, blocked) VALUES (?, ?, 1, ?, 0)`;
        this.sql.execute(insertQuery, [ipHash, endpoint, now]);

        if (this.logLevel === "debug") {
          this.logger.debug(
            `RateLimit: New entry for ${this.maskIP(ip)} on ${endpoint}`
          );
        }
        return { allowed: true };
      }

      // Check if currently blocked
      if (result.blocked === 1) {
        // Check if block duration has expired
        if (now - result.lastRequest > this.blockDuration) {
          // Unblock and reset count
          const unblockQuery = `UPDATE rate_limits SET blocked = 0, count = 1, lastRequest = ? WHERE ipHash = ? AND endpoint = ?`;
          this.sql.execute(unblockQuery, [now, ipHash, endpoint]);

          this.logger.info(
            `RateLimit: Block expired for ${this.maskIP(ip)} on ${endpoint}`
          );
          this.addAuditLog(
            ip,
            `RATELIMIT_UNBLOCKED`,
            `Endpoint: ${endpoint}`,
            true
          ); // Log unblocking
          return { allowed: true };
        } else {
          // Still blocked
          // Log repeated attempts while blocked as suspicious
          if (now - result.lastRequest < this.rateLimitWindow / 2) {
            // Check more frequently than block duration
            this.trackSuspiciousActivity(ip, `${endpoint}_BLOCKED`);
          }
          return {
            allowed: false,
            error: "Too many requests. Please try again later.",
          };
        }
      }

      // Not blocked, check request count within the window
      if (result.lastRequest < windowStart) {
        // Window expired, reset count
        const resetQuery = `UPDATE rate_limits SET count = 1, lastRequest = ? WHERE ipHash = ? AND endpoint = ?`;
        this.sql.execute(resetQuery, [now, ipHash, endpoint]);
        return { allowed: true };
      } else {
        // Within window, increment count
        const newCount = result.count + 1;

        // Check if new count exceeds limit
        if (newCount > this.maxRequestsPerWindow) {
          // Exceeded limit, block the IP for this endpoint
          const blockQuery = `UPDATE rate_limits SET blocked = 1, lastRequest = ?, count = ? WHERE ipHash = ? AND endpoint = ?`;
          this.sql.execute(blockQuery, [now, newCount, ipHash, endpoint]); // Update lastRequest time to start of block

          this.logger.warn(
            `RateLimit: Blocking ${this.maskIP(
              ip
            )} on ${endpoint} (${newCount}/${this.maxRequestsPerWindow})`
          );
          this.logSecurityEvent(
            "MEDIUM",
            ip,
            `Rate limit exceeded on ${endpoint}, blocking IP.`,
            true
          );
          this.addAuditLog(
            ip,
            `RATELIMIT_BLOCKED`,
            `Endpoint: ${endpoint}, Count: ${newCount}`,
            false
          ); // Log blocking

          // Also track this blocking event as suspicious
          this.trackSuspiciousActivity(ip, `${endpoint}_EXCEEDED`);
          return {
            allowed: false,
            error: "Too many requests. Please try again later.",
          };
        } else {
          // Within limit, update count and last request time
          const updateQuery = `UPDATE rate_limits SET count = ?, lastRequest = ? WHERE ipHash = ? AND endpoint = ?`;
          this.sql.execute(updateQuery, [newCount, now, ipHash, endpoint]);

          // Log if approaching limit (e.g., at 80%)
          if (newCount >= Math.floor(this.maxRequestsPerWindow * 0.8)) {
            if (
              this.logLevel === "debug" ||
              newCount === this.maxRequestsPerWindow
            )
              // Log debug or exactly when hitting limit
              this.logger.debug(
                `RateLimit: Approaching limit for ${this.maskIP(
                  ip
                )} on ${endpoint} (${newCount}/${this.maxRequestsPerWindow})`
              );
          }

          return { allowed: true };
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `RateLimit: Check error for ${this.maskIP(
          ip
        )} on ${endpoint}: ${errorMessage}`
      );
      // Fail open (allow request) in case of database error, but log it
      this.logSecurityEvent(
        "HIGH",
        ip,
        `Rate limit check failed: ${errorMessage}`,
        false
      ); // Log error as high severity event
      this.trackSuspiciousActivity(ip, `${endpoint}_ERROR`); // Track errors too
      return { allowed: true }; // Fail open, but could be configured to fail closed { allowed: false, error: "Internal server error." }
    }
  }

  /**
   * Get audit logs with pagination. (Moved from Providers)
   * Only accessible for authenticated admin users with enhanced security controls.
   * @param page Page number (1-based)
   * @param limit Results per page
   * @param clientIp Client IP address for rate limiting and auditing (important for security)
   * @param filters Optional filters for audit log entries
   * @returns Array of audit log entries or empty array if access denied
   */
  public getAuditLogs(
    page: number = 1,
    limit: number = 50,
    clientIp: string = "unknown", // Require IP for this sensitive operation
    filters?: {
      action?: string;
      startTime?: number;
      endTime?: number;
      success?: boolean;
      maskedIp?: string;
    }
  ): AuditLogEntry[] {
    const requestId = crypto.randomBytes(4).toString("hex");

    try {
      // Security check: Require a valid IP (not 'unknown' or 'system')
      if (clientIp === "unknown" || clientIp === "system") {
        this.logSecurityEvent(
          "HIGH",
          clientIp,
          "Attempted to access audit logs without valid source IP",
          true
        );
        return [];
      }

      // Rate limit check specific to this sensitive endpoint
      const rateCheck = this.checkRateLimit(clientIp, "getAuditLogs");
      if (!rateCheck.allowed) {
        this.logSecurityEvent(
          "MEDIUM",
          clientIp,
          "Rate limited access to audit logs",
          true
        );
        // Do NOT log this failure to audit log itself to prevent log flooding from attacks
        return [];
      }

      // Log access attempt *before* executing query (but after rate limiting)
      this.logger.info(
        `[${requestId}] Audit log access attempt from ${this.maskIP(clientIp)}`
      );

      // Input validation with safe defaults and tighter limits
      const validPage = Math.max(1, Math.min(1000, Math.floor(page))); // Prevent excessive pagination offset
      const validLimit = Math.min(100, Math.max(1, Math.floor(limit))); // Cap results per page
      const offset = (validPage - 1) * validLimit;

      // Build query with parameter placeholders
      let query = `SELECT id, timestamp, maskedIp, action, details, success FROM audit_log WHERE 1=1`;
      const queryParams: Array<string | number | boolean> = []; // Use union type

      // Apply filters safely (using parameter binding)
      if (filters) {
        if (filters.action && typeof filters.action === "string") {
          // Basic sanitization/validation for action filter
          const safeAction = filters.action
            .trim()
            .replace(/[^a-zA-Z0-9_]/g, ""); // Allow alphanumeric and underscore
          if (safeAction) {
            query += ` AND action = ?`;
            queryParams.push(safeAction);
          }
        }
        if (filters.maskedIp && typeof filters.maskedIp === "string") {
          // Allow filtering by masked IP - use LIKE for partial matches if needed, but exact match is safer
          const safeMaskedIp = filters.maskedIp.trim();
          // Very basic validation for a masked IP pattern
          if (
            /^(\d{1,3}\.\d{1,3}\.xxx\.xxx|[\w:.]+:xxxx(:xxxx)*|[\w.]{3}\.\.\.[\w.]{3}|[\w.]{2}\.\.\.|xxx|unknown|SYSTEM)$/.test(
              safeMaskedIp
            )
          ) {
            query += ` AND maskedIp = ?`;
            queryParams.push(safeMaskedIp);
          } else {
            this.logger.warn(
              `[${requestId}] Invalid masked IP filter format ignored: ${filters.maskedIp}`
            );
          }
        }
        if (
          filters.startTime &&
          typeof filters.startTime === "number" &&
          filters.startTime > 0
        ) {
          query += ` AND timestamp >= ?`;
          queryParams.push(Math.floor(filters.startTime)); // Ensure integer timestamp
        }
        if (
          filters.endTime &&
          typeof filters.endTime === "number" &&
          filters.endTime > 0
        ) {
          // Ensure endTime is after startTime if both are provided
          if (!filters.startTime || filters.endTime >= filters.startTime) {
            query += ` AND timestamp <= ?`;
            queryParams.push(Math.floor(filters.endTime)); // Ensure integer timestamp
          } else {
            this.logger.warn(
              `[${requestId}] Invalid time range filter ignored (endTime < startTime).`
            );
          }
        }
        if (typeof filters.success === "boolean") {
          query += ` AND success = ?`;
          queryParams.push(filters.success ? 1 : 0); // Use 1/0 for boolean
        }
      }

      // Add sorting and pagination
      query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      queryParams.push(validLimit, offset);

      // Execute query with parameter binding
      const result = this.sql.query<AuditLogEntry>(query, queryParams);

      // Log successful access (only if results were returned or no filters applied)
      this.addAuditLog(
        clientIp,
        "GET_AUDIT_LOGS",
        `Filters: ${JSON.stringify(
          filters || {}
        )}, Page: ${validPage}, Limit: ${validLimit}, Results: ${
          result.data.length
        }`,
        true
      );

      // Return results
      // Note: The 'success' field will be 0 or 1 from the DB. Convert back to boolean if needed by the caller.
      return result.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Error getting audit logs for ${this.maskIP(
          clientIp
        )}: ${errorMessage}`
      );

      // Log as security event - potential DB issue or query manipulation attempt
      this.logSecurityEvent(
        "LOW",
        clientIp,
        `Audit log access error: ${errorMessage}`,
        false
      );

      // Do *not* add this error to the audit log itself to prevent feedback loops / log flooding
      // Return empty array on error to the caller
      return [];
    }
  }

  /**
   * Clear rate limit blocks for testing or admin purposes. (Moved from Providers)
   * Enhanced with additional security checks and comprehensive logging.
   * Only available in development environment or with authorized IPs/keys.
   * @param clientIp Client IP address for authorization and auditing
   * @param adminKey Optional admin key for additional authorization
   * @returns Success status and message
   */
  public clearRateLimitBlocks(
    clientIp: string = "unknown",
    adminKey?: string
  ): { success: boolean; message?: string } {
    const requestId = crypto.randomBytes(4).toString("hex");
    const maskedIp = this.maskIP(clientIp);
    this.logger.warn(
      `[${requestId}] Rate limit clear attempt from ${maskedIp}`
    );

    // --- Authorization Checks ---

    // 1. Environment Check (Strictest)
    const isDevelopment =
      process.env.NODE_ENV === "development" ||
      Bun.env.NODE_ENV === "development";
    if (!isDevelopment) {
      // In production, require BOTH an allowed IP AND a valid admin key
      const configuredAdminKey = process.env.ADMIN_KEY || Bun.env.ADMIN_KEY;
      const allowedIPs = (process.env.ADMIN_IPS || Bun.env.ADMIN_IPS || "")
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean);

      if (!configuredAdminKey || adminKey !== configuredAdminKey) {
        this.logSecurityEvent(
          "CRITICAL",
          clientIp,
          "Attempted rate limit clear without valid admin key in production",
          true
        );
        this.addAuditLog(
          clientIp,
          "CLEAR_RATE_LIMITS_DENIED",
          "Invalid or missing admin key in production",
          false
        );
        return { success: false, message: "Unauthorized: Admin key required" };
      }
      if (clientIp === "unknown" || !allowedIPs.includes(clientIp)) {
        this.logSecurityEvent(
          "CRITICAL",
          clientIp,
          "Attempted rate limit clear from unauthorized IP in production",
          true
        );
        this.addAuditLog(
          clientIp,
          "CLEAR_RATE_LIMITS_DENIED",
          "Unauthorized IP in production",
          false
        );
        return {
          success: false,
          message: "Unauthorized: IP address not allowed",
        };
      }
      // If we reach here in production, IP and Key are valid.
      this.logger.warn(
        `[${requestId}] Authorized rate limit clear requested in PRODUCTION by ${maskedIp}`
      );
    } else {
      // In development, allow via IP OR Key (more lenient for testing)
      const configuredAdminKey = process.env.ADMIN_KEY || Bun.env.ADMIN_KEY;
      const allowedIPs = (
        process.env.ADMIN_IPS ||
        Bun.env.ADMIN_IPS ||
        "127.0.0.1,::1"
      )
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean); // Default to localhost in dev

      const ipAllowed = clientIp !== "unknown" && allowedIPs.includes(clientIp);
      const keyAllowed = configuredAdminKey && adminKey === configuredAdminKey;

      if (!ipAllowed && !keyAllowed) {
        this.logSecurityEvent(
          "HIGH",
          clientIp,
          "Unauthorized attempt to clear rate limits in development",
          true
        );
        this.addAuditLog(
          clientIp,
          "CLEAR_RATE_LIMITS_DENIED",
          "Unauthorized IP or key in development",
          false
        );
        return {
          success: false,
          message: "Unauthorized access (IP or Admin Key required in dev)",
        };
      }
      // If we reach here in development, either IP or Key (if set) is valid.
    }

    // --- Execution ---
    try {
      // Get count of blocked entries *before* clearing for logging
      const countQuery = `SELECT COUNT(*) as blocked_count FROM rate_limits WHERE blocked = 1`;
      const countResult = this.sql.queryOne<{ blocked_count: number }>(
        countQuery
      );
      const blockedCount = countResult?.blocked_count || 0;

      // Clear all blocks by setting blocked = 0. Keep counts and lastRequest as they are.
      // Resetting counts might hide recent activity patterns.
      // Alternatively, could delete rows where blocked=1, but update is less destructive.
      const query = `UPDATE rate_limits SET blocked = 0 WHERE blocked = 1`;
      const result = this.sql.execute(query);
      const changes = result.changes || 0;

      // Enhanced logging with detailed information
      this.logger.warn(
        `[${requestId}] Rate limits blocks cleared by ${maskedIp}. ${changes} entries unblocked (previously ${blockedCount} reported).`
      );
      // Add specific audit log entry for this admin action
      this.addAuditLog(
        clientIp,
        "CLEAR_RATE_LIMITS_SUCCESS",
        `Cleared ${changes} rate limit blocks. Initiated by ${maskedIp}.`,
        true
      );
      // Log as a security event as well, indicating manual intervention
      this.logSecurityEvent(
        "MEDIUM",
        clientIp,
        `Rate limit blocks manually cleared (${changes} entries unblocked).`,
        false
      );

      return {
        success: true,
        message: `Successfully cleared ${changes} rate limit blocks.`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Error clearing rate limits initiated by ${maskedIp}: ${errorMessage}`
      );
      // Log failure as security event
      this.logSecurityEvent(
        "HIGH",
        clientIp,
        `Error clearing rate limits: ${errorMessage}`,
        false
      );
      // Add failure audit log
      this.addAuditLog(
        clientIp,
        "CLEAR_RATE_LIMITS_ERROR",
        `Error: ${errorMessage}`,
        false
      );

      return {
        success: false,
        message: "An error occurred while clearing rate limit blocks.",
      };
    }
  }
}
