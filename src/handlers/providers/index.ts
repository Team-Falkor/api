import { dbPath } from "@/main";
import crypto from "node:crypto";
import type { PluginSetupJSON } from "../../@types";
import { Console } from "../../utils/console";
import { RateLimit, type AuditLogEntry } from "../ratelimit";
import { SQLHelper } from "../sql";

interface ProviderDB {
  id: string;
  setupUrl: string;
  setupJSON: PluginSetupJSON;
}

type ProviderDBSearch = Partial<{
  id?: string;
  setupUrl?: string;
  setupJSON?: Partial<PluginSetupJSON>;
}>;

class Providers {
  sql: SQLHelper;
  private logger = new Console({ prefix: "Providers" });
  // Keep the RateLimit instance
  private rateLimit: RateLimit;

  constructor() {
    // Initialize database connection
    this.sql = new SQLHelper(dbPath, { create: true });

    // Initialize rate limiter (which now also handles audit logs)
    this.rateLimit = new RateLimit();

    // Initialize database tables specific to Providers
    this.initTable();

    // Log startup information
    this.logger.info(`Providers service initialized`);
  }

  /**
   * Initialize tables if they don't exist (only provider table now)
   */
  private initTable(): void {
    // Create providers table
    const providersQuery = `
            CREATE TABLE IF NOT EXISTS providers (
                id TEXT PRIMARY KEY,
                setupUrl TEXT NOT NULL,
                setupJSON TEXT NOT NULL
            )
        `;
    this.sql.execute(providersQuery);
    // Audit log and rate limit tables are initialized within RateLimit class
  }

  // --- Methods moved to RateLimit Class ---
  // private addAuditLog(...) - Moved
  // private logSecurityEvent(...) - Moved
  // private checkRateLimit(...) - Moved
  // getAuditLogs(...) - Moved
  // clearRateLimitBlocks(...) - Moved
  // maskIP(...) - Moved (and potentially made public in RateLimit)

  /**
   * Sanitize and validate input data
   */
  private sanitizeInput(data: string, type?: "id" | "url" | "general"): string {
    if (!data || typeof data !== "string") {
      return "";
    }

    // Trim whitespace
    const trimmed = data.trim();

    // Apply type-specific validation
    switch (type) {
      case "id":
        // For IDs: alphanumeric, underscore, dash, dot only
        if (!/^[\w\-\.]+$/i.test(trimmed)) {
          this.logger.warn(
            `Invalid ID format rejected: ${this.truncateForLogging(trimmed)}`
          );
          return "";
        }
        break;

      case "url":
        // For URLs: basic URL validation
        try {
          new URL(trimmed);
          // Additional check for dangerous protocols
          if (trimmed.match(/^(javascript|data|vbscript|file):/i)) {
            this.logger.warn(
              `Potentially dangerous URL rejected: ${this.truncateForLogging(
                trimmed
              )}`
            );
            return "";
          }
        } catch (e) {
          this.logger.warn(
            `Invalid URL format rejected: ${this.truncateForLogging(trimmed)}`
          );
          return "";
        }
        break;

      default:
        // General sanitization: remove dangerous characters
        break;
    }

    // Remove potentially dangerous characters for all types
    return trimmed.replace(/[\<\>\&\"\'\`\;\{\}\[\]\(\)\$\#\~\|]/g, "");
  }

  /**
   * Truncate long strings for safe logging
   */
  private truncateForLogging(str: string, maxLength: number = 50): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "...";
  }

  /**
   * Add a new provider with enhanced validation, duplication handling and rate limiting.
   * Includes additional security checks and detailed logging.
   */
  addProvider(
    setupUrl: string,
    setupJSON: PluginSetupJSON,
    clientIp: string = "unknown"
  ): { success: boolean; id?: string; error?: string } {
    const startTime = Date.now();
    const requestId = crypto.randomBytes(4).toString("hex"); // Keep crypto for request ID

    try {
      // Use maskIP from RateLimit instance for logging
      this.logger.info(
        `[${requestId}] Provider add request from ${this.rateLimit.maskIP(
          clientIp
        )}`
      );

      // Check rate limits using the RateLimit class instance
      const rateCheck = this.rateLimit.checkRateLimit(clientIp, "addProvider");
      if (!rateCheck.allowed) {
        // Audit log is implicitly handled by checkRateLimit/addAuditLog in RateLimit class if needed
        return { success: false, error: rateCheck.error };
      }

      // Enhanced input validation
      const sanitizedUrl = this.sanitizeInput(setupUrl, "url");
      let sanitizedId = "";

      // Validate setupJSON structure
      if (!setupJSON || typeof setupJSON !== "object") {
        // Use RateLimit instance for audit logging
        this.rateLimit.addAuditLog(
          clientIp,
          "ADD_PROVIDER_INVALID_JSON",
          "Invalid setupJSON structure",
          false
        );
        return { success: false, error: "Invalid provider configuration" };
      }

      // Validate ID separately
      if (!setupJSON.id || typeof setupJSON.id !== "string") {
        this.rateLimit.addAuditLog(
          clientIp,
          "ADD_PROVIDER_MISSING_ID",
          JSON.stringify({ setupUrl }),
          false
        );
        return { success: false, error: "Provider ID is required" };
      }

      sanitizedId = this.sanitizeInput(setupJSON.id, "id");

      // Comprehensive validation
      if (!sanitizedUrl) {
        this.rateLimit.addAuditLog(
          clientIp,
          "ADD_PROVIDER_INVALID_URL",
          setupUrl,
          false
        );
        return { success: false, error: "Invalid setup URL format" };
      }

      if (!sanitizedId) {
        this.rateLimit.addAuditLog(
          clientIp,
          "ADD_PROVIDER_INVALID_ID",
          setupJSON.id,
          false
        );
        return { success: false, error: "Invalid provider ID format" };
      }

      // Validate required fields in setupJSON
      if (!this.validateProviderConfig(setupJSON)) {
        this.rateLimit.addAuditLog(
          clientIp,
          "ADD_PROVIDER_INVALID_CONFIG",
          JSON.stringify(setupJSON),
          false
        );
        return {
          success: false,
          error: "Provider configuration is incomplete or invalid",
        };
      }

      // Check if provider with this ID already exists (getProvider handles its own rate limiting/logging)
      // Pass "system" or a specific internal marker if this check shouldn't be rate limited like external calls
      const existingProvider = this.getProvider(sanitizedId, "system"); // Use "system" to bypass external rate limits/logging
      if (existingProvider) {
        this.rateLimit.addAuditLog(
          clientIp,
          "ADD_PROVIDER_DUPLICATE",
          sanitizedId,
          false
        );
        return {
          success: false,
          error: `Provider with ID ${sanitizedId} already exists`,
        };
      }

      // Prepare data for insertion
      const safeSetupJSON = { ...setupJSON, id: sanitizedId };
      const query = `INSERT INTO providers (id, setupUrl, setupJSON) VALUES (?, ?, ?)`;
      const result = this.sql.execute(query, [
        sanitizedId,
        sanitizedUrl,
        JSON.stringify(safeSetupJSON),
      ]);

      if (result.changes && result.changes > 0) {
        const duration = Date.now() - startTime;
        this.logger.info(
          `[${requestId}] Added provider: ${sanitizedId} (${duration}ms)`
        );
        this.rateLimit.addAuditLog(
          clientIp,
          "ADD_PROVIDER_SUCCESS",
          sanitizedId,
          true
        );
        return { success: true, id: sanitizedId };
      } else {
        this.rateLimit.addAuditLog(
          clientIp,
          "ADD_PROVIDER_FAILED",
          sanitizedId,
          false
        );
        return { success: false, error: "Failed to add provider" };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Error adding provider: ${errorMessage}`
      );

      // Log stack trace for debugging in development
      if (
        process.env.NODE_ENV === "development" &&
        error instanceof Error &&
        error.stack
      ) {
        this.logger.error(`Stack trace: ${error.stack}`);
      }

      this.rateLimit.addAuditLog(
        clientIp,
        "ADD_PROVIDER_ERROR",
        errorMessage,
        false
      );
      return {
        success: false,
        error: "An error occurred while adding the provider",
      };
    }
  }

  /**
   * Validate provider configuration
   * Ensures all required fields are present and valid
   */
  private validateProviderConfig(config: PluginSetupJSON): boolean {
    // Basic structure validation
    if (!config || typeof config !== "object") return false;

    // Check required fields individually with proper type checking
    if (!config.id || typeof config.id !== "string") {
      this.logger.warn("Provider config missing required field: id");
      return false;
    }

    if (!config.name || typeof config.name !== "string") {
      this.logger.warn("Provider config missing required field: name");
      return false;
    }

    if (!config.version || typeof config.version !== "string") {
      this.logger.warn("Provider config missing required field: version");
      return false;
    }

    // Validate version format (semver-like)
    if (!/^\d+\.\d+(\.\d+)?$/.test(config.version)) {
      this.logger.warn(
        `Provider has invalid version format: ${config.version}`
      );
      return false;
    }

    return true;
  }

  /**
   * Delete a provider by ID with rate limiting.
   */
  deleteProvider(
    id: string,
    clientIp: string = "unknown"
  ): { success: boolean; changes?: number; error?: string } {
    try {
      // Use RateLimit instance for checking rate limits
      const rateCheck = this.rateLimit.checkRateLimit(
        clientIp,
        "deleteProvider"
      );
      if (!rateCheck.allowed) {
        return { success: false, error: rateCheck.error };
      }

      const sanitizedId = this.sanitizeInput(id, "id"); // Use more specific sanitization
      if (!sanitizedId) {
        // Use RateLimit instance for audit logging
        this.rateLimit.addAuditLog(
          clientIp,
          "DELETE_PROVIDER_INVALID_ID",
          id,
          false
        );
        return { success: false, error: "Invalid provider ID" };
      }

      const query = `DELETE FROM providers WHERE id = ?`;
      const result = this.sql.execute(query, [sanitizedId]);

      if (result.changes && result.changes > 0) {
        this.logger.info(`Deleted provider: ${sanitizedId}`);
        this.rateLimit.addAuditLog(
          clientIp,
          "DELETE_PROVIDER_SUCCESS",
          sanitizedId,
          true
        );
        return { success: true, changes: result.changes };
      } else {
        this.rateLimit.addAuditLog(
          clientIp,
          "DELETE_PROVIDER_NOT_FOUND",
          sanitizedId,
          false
        );
        return {
          success: false,
          error: `Provider with ID ${sanitizedId} not found`,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error deleting provider: ${errorMessage}`);
      this.rateLimit.addAuditLog(
        clientIp,
        "DELETE_PROVIDER_ERROR",
        `${id}: ${errorMessage}`,
        false
      );
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get a provider by ID with rate limiting.
   */
  getProvider(id: string, clientIp: string = "unknown"): ProviderDB | null {
    try {
      // Allow internal calls (e.g., from addProvider) to bypass external rate limits/logging
      if (clientIp !== "system") {
        // Use RateLimit instance for checking rate limits
        const rateCheck = this.rateLimit.checkRateLimit(
          clientIp,
          "getProvider"
        );
        if (!rateCheck.allowed) {
          this.logger.warn(
            `Rate limit exceeded for getProvider by ${this.rateLimit.maskIP(
              clientIp
            )}`
          );
          // Optionally log this specific denial via addAuditLog if needed
          // this.rateLimit.addAuditLog(clientIp, "GET_PROVIDER_RATE_LIMITED", id, false);
          return null;
        }
      }

      const sanitizedId = this.sanitizeInput(id, "id"); // Use specific sanitization
      if (!sanitizedId) {
        if (clientIp !== "system") {
          // Use RateLimit instance for audit logging
          this.rateLimit.addAuditLog(
            clientIp,
            "GET_PROVIDER_INVALID_ID",
            id,
            false
          );
        }
        return null;
      }

      const query = `SELECT id, setupUrl, setupJSON FROM providers WHERE id = ?`;
      const result = this.sql.queryOne<{
        id: string;
        setupUrl: string;
        setupJSON: string;
      }>(query, [sanitizedId]);

      if (result) {
        // Only log successful external calls
        if (clientIp !== "system") {
          this.rateLimit.addAuditLog(
            clientIp,
            "GET_PROVIDER_SUCCESS",
            sanitizedId,
            true
          );
        }
        return {
          id: result.id,
          setupUrl: result.setupUrl,
          setupJSON: JSON.parse(result.setupJSON) as PluginSetupJSON,
        };
      }

      // Only log failed external calls
      if (clientIp !== "system") {
        this.rateLimit.addAuditLog(
          clientIp,
          "GET_PROVIDER_NOT_FOUND",
          sanitizedId,
          false
        );
      }
      return null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error getting provider: ${errorMessage}`);
      // Only log errors from external calls
      if (clientIp !== "system") {
        this.rateLimit.addAuditLog(
          clientIp,
          "GET_PROVIDER_ERROR",
          `${id}: ${errorMessage}`,
          false
        );
      }
      return null;
    }
  }

  /**
   * Get all providers with rate limiting.
   */
  getProviders(clientIp: string = "unknown"): ProviderDB[] {
    try {
      // Use RateLimit instance for checking rate limits
      const rateCheck = this.rateLimit.checkRateLimit(clientIp, "getProviders");
      if (!rateCheck.allowed) {
        this.logger.warn(
          `Rate limit exceeded for getProviders by ${this.rateLimit.maskIP(
            clientIp
          )}`
        );
        // Optionally log denial
        // this.rateLimit.addAuditLog(clientIp, "GET_PROVIDERS_RATE_LIMITED", "Attempted to list all providers", false);
        return [];
      }

      const query = `SELECT id, setupUrl, setupJSON FROM providers`;
      const result = this.sql.query<{
        id: string;
        setupUrl: string;
        setupJSON: string;
      }>(query);

      // Use RateLimit instance for audit logging
      this.rateLimit.addAuditLog(
        clientIp,
        "GET_PROVIDERS_SUCCESS",
        `Retrieved ${result.data.length} providers`,
        true
      );

      return result.data.map((item) => ({
        id: item.id,
        setupUrl: item.setupUrl,
        setupJSON: JSON.parse(item.setupJSON) as PluginSetupJSON,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error getting providers: ${errorMessage}`);
      // Use RateLimit instance for audit logging
      this.rateLimit.addAuditLog(
        clientIp,
        "GET_PROVIDERS_ERROR",
        errorMessage,
        false
      );
      return [];
    }
  }

  /**
   * Update an existing provider with rate limiting.
   */
  updateProvider(
    id: string,
    setupUrl: string,
    setupJSON: PluginSetupJSON,
    clientIp: string = "unknown"
  ): { success: boolean; changes?: number; error?: string } {
    try {
      // Use RateLimit instance for checking rate limits
      const rateCheck = this.rateLimit.checkRateLimit(
        clientIp,
        "updateProvider"
      );
      if (!rateCheck.allowed) {
        return { success: false, error: rateCheck.error };
      }

      const sanitizedId = this.sanitizeInput(id, "id");
      const sanitizedUrl = this.sanitizeInput(setupUrl, "url");

      // Validate JSON structure and required fields *before* DB check
      if (
        !sanitizedId ||
        !sanitizedUrl ||
        !setupJSON ||
        typeof setupJSON !== "object"
      ) {
        this.rateLimit.addAuditLog(
          clientIp,
          "UPDATE_PROVIDER_INVALID_INPUT",
          JSON.stringify({ id, setupUrl }),
          false
        );
        return { success: false, error: "Invalid input data" };
      }
      // Ensure the ID in the JSON matches the path ID and is valid
      const sanitizedJsonId = this.sanitizeInput(setupJSON.id, "id");
      if (!sanitizedJsonId || sanitizedJsonId !== sanitizedId) {
        this.rateLimit.addAuditLog(
          clientIp,
          "UPDATE_PROVIDER_ID_MISMATCH",
          `Path ID: ${sanitizedId}, Body ID: ${setupJSON.id}`,
          false
        );
        return {
          success: false,
          error: "Provider ID in body must match URL and be valid",
        };
      }

      if (!this.validateProviderConfig(setupJSON)) {
        this.rateLimit.addAuditLog(
          clientIp,
          "UPDATE_PROVIDER_INVALID_CONFIG",
          JSON.stringify(setupJSON),
          false
        );
        return {
          success: false,
          error: "Provider configuration is incomplete or invalid",
        };
      }

      // Check if provider exists (use "system" to avoid rate limit/log for this internal check)
      const existingProvider = this.getProvider(sanitizedId, "system");
      if (!existingProvider) {
        // Log the external attempt failure
        this.rateLimit.addAuditLog(
          clientIp,
          "UPDATE_PROVIDER_NOT_FOUND",
          sanitizedId,
          false
        );
        return {
          success: false,
          error: `Provider with ID ${sanitizedId} not found`,
        };
      }

      // Prepare safe data
      const safeSetupJSON = { ...setupJSON, id: sanitizedId }; // Ensure ID is the sanitized one
      const query = `UPDATE providers SET setupUrl = ?, setupJSON = ? WHERE id = ?`;
      const result = this.sql.execute(query, [
        sanitizedUrl,
        JSON.stringify(safeSetupJSON),
        sanitizedId,
      ]);

      if (result.changes && result.changes > 0) {
        this.logger.info(`Updated provider: ${sanitizedId}`);
        this.rateLimit.addAuditLog(
          clientIp,
          "UPDATE_PROVIDER_SUCCESS",
          sanitizedId,
          true
        );
        return { success: true, changes: result.changes };
      } else {
        // This might happen if the submitted data is identical to existing data
        this.rateLimit.addAuditLog(
          clientIp,
          "UPDATE_PROVIDER_NO_CHANGES",
          sanitizedId,
          true
        ); // Log as success=true, as the state matches intent
        return {
          success: true,
          changes: 0,
          error: "No changes made to provider (data might be identical)",
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error updating provider: ${errorMessage}`);
      this.rateLimit.addAuditLog(
        clientIp,
        "UPDATE_PROVIDER_ERROR",
        `${id}: ${errorMessage}`,
        false
      );
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Search providers based on search criteria with rate limiting and security measures
   * @param searchParams Search parameters (id, url, or setupJSON fields)
   * @param clientIp Client IP for rate limiting
   * @returns Array of matching providers and metadata
   */
  searchProviders(
    searchParams: ProviderDBSearch,
    clientIp: string = "unknown"
  ): { success: boolean; providers?: ProviderDB[]; error?: string } {
    const requestId = crypto.randomBytes(4).toString("hex");

    try {
      // Use RateLimit instance for masking IP
      this.logger.info(
        `[${requestId}] Provider search request from ${this.rateLimit.maskIP(
          clientIp
        )}`
      );

      // Check rate limits using RateLimit instance
      const rateCheck = this.rateLimit.checkRateLimit(
        clientIp,
        "searchProviders"
      );
      if (!rateCheck.allowed) {
        // Optionally log denial
        // this.rateLimit.addAuditLog(clientIp, "SEARCH_PROVIDERS_RATE_LIMITED", JSON.stringify(searchParams), false);
        return { success: false, error: rateCheck.error };
      }

      // Build base query
      let query = "SELECT id, setupUrl, setupJSON FROM providers WHERE 1=1"; // Select specific columns
      const params: (string | number)[] = []; // Use more specific type

      // Add search conditions with sanitized inputs
      if (searchParams.id) {
        const sanitizedId = this.sanitizeInput(searchParams.id, "id");
        if (sanitizedId) {
          query += " AND id LIKE ?";
          params.push(`%${sanitizedId}%`);
        }
      }

      if (searchParams.setupUrl) {
        const sanitizedUrl = this.sanitizeInput(searchParams.setupUrl, "url");
        if (sanitizedUrl) {
          query += " AND setupUrl LIKE ?";
          params.push(`%${sanitizedUrl}%`);
        }
      }

      // Handle setupJSON field searches
      if (searchParams.setupJSON) {
        const setupJSON = searchParams.setupJSON;

        // Search by name
        if (setupJSON.name) {
          const sanitizedName = this.sanitizeInput(setupJSON.name, "general");
          if (sanitizedName) {
            query += " AND json_extract(setupJSON, '$.name') LIKE ?";
            params.push(`%${sanitizedName}%`);
          }
        }

        // Search by description
        if (setupJSON.description) {
          const sanitizedDesc = this.sanitizeInput(
            setupJSON.description,
            "general"
          );
          if (sanitizedDesc) {
            query += " AND json_extract(setupJSON, '$.description') LIKE ?";
            params.push(`%${sanitizedDesc}%`);
          }
        }

        // Search by version
        if (setupJSON.version) {
          const sanitizedVersion = this.sanitizeInput(
            setupJSON.version,
            "general"
          );
          // Could add specific version validation/sanitization here
          if (sanitizedVersion) {
            query += " AND json_extract(setupJSON, '$.version') LIKE ?";
            params.push(`%${sanitizedVersion}%`);
          }
        }

        // Search by author name
        if (setupJSON.author?.name) {
          const sanitizedAuthor = this.sanitizeInput(
            setupJSON.author.name,
            "general"
          );
          if (sanitizedAuthor) {
            query += " AND json_extract(setupJSON, '$.author.name') LIKE ?";
            params.push(`%${sanitizedAuthor}%`);
          }
        }

        // Search by multiple_choice flag (handle boolean correctly)
        if (typeof setupJSON.multiple_choice === "boolean") {
          query += " AND json_extract(setupJSON, '$.multiple_choice') = ?";
          params.push(setupJSON.multiple_choice ? 1 : 0); // Use 1/0 for boolean in SQLite JSON
        }
      }

      // Limit results to prevent abuse
      const resultLimit = 100;
      query += ` LIMIT ?`;
      params.push(resultLimit);

      // Execute search query
      const result = this.sql.query<{
        id: string;
        setupUrl: string;
        setupJSON: string;
      }>(query, params);

      // Parse setupJSON for each provider
      const providers = result.data.map((provider) => ({
        id: provider.id,
        setupUrl: provider.setupUrl,
        setupJSON: JSON.parse(provider.setupJSON) as PluginSetupJSON, // Assuming setupJSON is stored as string
      }));

      // Log successful search using RateLimit instance
      this.rateLimit.addAuditLog(
        clientIp,
        "SEARCH_PROVIDERS",
        `Found ${providers.length} providers matching criteria (limit ${resultLimit})`,
        true
      );

      return { success: true, providers };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Provider search failed: ${errorMessage}`
      );

      // Log the error as a security event if it seems suspicious using RateLimit instance
      if (
        errorMessage.includes("syntax") ||
        errorMessage.includes("malformed")
      ) {
        this.rateLimit.logSecurityEvent(
          "LOW",
          clientIp,
          `Suspicious search attempt: ${errorMessage}`,
          true
        );
      }

      this.rateLimit.addAuditLog(
        clientIp,
        "SEARCH_PROVIDERS_FAILED",
        errorMessage,
        false
      );
      return { success: false, error: "Failed to search providers" };
    }
  }

  // --- Expose Audit/RateLimit Admin Functions if needed ---
  // If external code needs access to audit logs or clearing rate limits,
  // expose them via the Providers instance by wrapping the RateLimit methods.
  // Otherwise, these functions are only accessible via a RateLimit instance.

  /**
   * Get audit logs (proxied to RateLimit class).
   */
  getAuditLogs(
    page: number = 1,
    limit: number = 50,
    clientIp: string = "unknown",
    filters?: {
      action?: string;
      startTime?: number;
      endTime?: number;
      success?: boolean;
    }
  ): AuditLogEntry[] {
    // You could add provider-specific authorization here if needed
    return this.rateLimit.getAuditLogs(page, limit, clientIp, filters);
  }

  /**
   * Clear rate limit blocks (proxied to RateLimit class).
   * Use with extreme caution.
   */
  clearRateLimitBlocks(
    clientIp: string = "unknown",
    adminKey?: string
  ): { success: boolean; message?: string } {
    // You could add provider-specific authorization here if needed
    return this.rateLimit.clearRateLimitBlocks(clientIp, adminKey);
  }
}

export const providers = new Providers();

// ----------------------------------------------------
// rate limit class (now includes audit log logic)
// ----------------------------------------------------
