import { dbPath } from "@/main";
import { SQLHelper } from "../sql";
import type { PluginSetupJSON } from "../../@types";
import { Console } from "../../utils/console";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

interface ProviderDB {
    id: string;
    setupUrl: string;
    setupJSON: PluginSetupJSON;
}

type ProviderDBSearch = Partial<{
    id?: string;
    setupUrl?: string;
    setupJSON?: Partial<PluginSetupJSON>;
}>

interface RateLimitEntry {
    ipHash: string;
    endpoint: string;
    count: number;
    lastRequest: number;
    blocked: number;
}

interface AuditLogEntry {
    id?: number;
    timestamp: number;
    maskedIp: string;
    action: string;
    details: string;
    success: number;
}

class Providers {
    sql: SQLHelper;
    private logger = new Console({ prefix: "Providers" });
    // Rate limiting configuration
    private rateLimitWindow = 60 * 1000; // 1 minute in milliseconds
    private maxRequestsPerWindow = 10; // Maximum requests per window
    private blockDuration = 10 * 60 * 1000; // 10 minutes in milliseconds
    private suspiciousActivityThreshold = 5; // Number of failed attempts before logging suspicious activity
    
    // Security configuration
    private secretKey: string = process.env.IP_SECRET_KEY || Bun.env.IP_SECRET_KEY || "default-secret-key-please-change";
    private logLevel: 'debug' | 'info' | 'warn' | 'error' = process.env.LOG_LEVEL || Bun.env.LOG_LEVEL || 'info';
    private securityLogFile: string | null = process.env.SECURITY_LOG_FILE || Bun.env.SECURITY_LOG_FILE || null;
    
    // Track suspicious activity
    private suspiciousIPs: Map<string, number> = new Map();

    constructor() {
        // Initialize database connection
        this.sql = new SQLHelper(dbPath, { create: true });
        
        // Initialize database tables
        this.initTable();
        
        // Validate secret key
        this.validateSecretKey();
        
        // Log startup information
        this.logger.info(`Providers service initialized with log level: ${this.logLevel}`);
        if (this.secretKey === "default-secret-key-please-change") {
            this.logger.warn("Using default secret key. This is insecure for production environments.");
        }
    }
    
    /**
     * Validate the secret key used for IP hashing
     * Warns if using default key in production
     */
    private validateSecretKey(): void {
        const isProduction = process.env.NODE_ENV === "production" || Bun.env.NODE_ENV === "production";
        
        if (isProduction && this.secretKey === "default-secret-key-please-change") {
            this.logger.error("SECURITY RISK: Using default secret key in production environment!");
            this.logSecurityEvent("CRITICAL", "system", "Default secret key used in production", false);
        }
        
        if (this.secretKey.length < 16) {
            this.logger.warn("Secret key is too short (< 16 chars). This reduces security of IP hashing.");
        }
    }
    
    /**
     * Initialize tables if they don't exist
     */
    private initTable(): void {
        // Create providers table (does not store raw IP)
        const providersQuery = `
            CREATE TABLE IF NOT EXISTS providers (
                id TEXT PRIMARY KEY,
                setupUrl TEXT NOT NULL,
                setupJSON TEXT NOT NULL
            )
        `;
        this.sql.execute(providersQuery);
        
        // Create rate limiting table: store IP hash instead of raw IP
        const rateLimitQuery = `
            CREATE TABLE IF NOT EXISTS rate_limits (
                ipHash TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                count INTEGER NOT NULL,
                lastRequest INTEGER NOT NULL,
                blocked INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (ipHash, endpoint)
            )
        `;
        this.sql.execute(rateLimitQuery);
        
        // Create audit log table: store only masked IP
        const auditLogQuery = `
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                maskedIp TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                success INTEGER NOT NULL
            )
        `;
        this.sql.execute(auditLogQuery);
    }

    /**
     * Compute a deterministic hash of an IP address using HMAC-SHA256
     */
    private hashIP(ip: string): string {
        if (ip === "::1") ip = "127.0.0.1";
        const hmac = crypto.createHmac("sha256", this.secretKey);
        hmac.update(ip);
        return hmac.digest("hex");
    }
    
    /**
     * Check rate limits for a given IP and endpoint with enhanced security monitoring.
     * Uses the hashed IP for lookups and detects potential DDoS attempts.
     */
    private checkRateLimit(ip: string, endpoint: string): { allowed: boolean; error?: string } {
        try {
            const now = Date.now();
            const windowStart = now - this.rateLimitWindow;
            const ipHash = this.hashIP(ip);
            
            // Get current rate limit entry for this IP and endpoint
            const query = `SELECT * FROM rate_limits WHERE ipHash = ? AND endpoint = ?`;
            const result = this.sql.queryOne<RateLimitEntry>(query, [ipHash, endpoint]);
            
            // If no entry exists, create one and allow the request
            if (!result) {
                const insertQuery = `INSERT INTO rate_limits (ipHash, endpoint, count, lastRequest, blocked) VALUES (?, ?, 1, ?, 0)`;
                this.sql.execute(insertQuery, [ipHash, endpoint, now]);
                
                if (this.logLevel === 'debug') {
                    this.logger.info(`New rate limit entry for ${this.maskIP(ip)} on ${endpoint}`);
                }
                
                return { allowed: true };
            }
            
            // Check if IP is blocked
            if (result.blocked) {
                // Check if block duration has expired
                if (now - result.lastRequest > this.blockDuration) {
                    // Unblock the IP: reset count and blocked flag
                    const unblockQuery = `UPDATE rate_limits SET blocked = 0, count = 1, lastRequest = ? WHERE ipHash = ? AND endpoint = ?`;
                    this.sql.execute(unblockQuery, [now, ipHash, endpoint]);
                    
                    this.logger.info(`Rate limit block expired for ${this.maskIP(ip)} on ${endpoint}`);
                    return { allowed: true };
                }
                
                // Log continued attempts while blocked (potential attack)
                if (now - result.lastRequest < 5000) { // Multiple requests within 5 seconds while blocked
                    this.logSecurityEvent('MEDIUM', ip, `Repeated requests while blocked: ${endpoint}`, true);
                }
                
                return { allowed: false, error: "Too many requests. Please try again later." };
            }
            
            // Reset count if outside the current window
            if (result.lastRequest < windowStart) {
                const resetQuery = `UPDATE rate_limits SET count = 1, lastRequest = ? WHERE ipHash = ? AND endpoint = ?`;
                this.sql.execute(resetQuery, [now, ipHash, endpoint]);
                return { allowed: true };
            }
            
            // Calculate request rate (requests per second)
            const timeElapsed = Math.max(1, (now - result.lastRequest) / 1000); // in seconds
            const requestRate = 1 / timeElapsed; // requests per second
            
            // Detect abnormally high request rates (potential DDoS)
            if (requestRate > 5 && result.count > 3) { // More than 5 requests per second after 3 requests
                this.logSecurityEvent('HIGH', ip, `Abnormal request rate detected: ${requestRate.toFixed(2)}/sec on ${endpoint}`, true);
            }
            
            // Increment count and check if over limit
            const newCount = result.count + 1;
            if (newCount > this.maxRequestsPerWindow) {
                // Block the IP
                const blockQuery = `UPDATE rate_limits SET blocked = 1, lastRequest = ? WHERE ipHash = ? AND endpoint = ?`;
                this.sql.execute(blockQuery, [now, ipHash, endpoint]);
                
                // Log the blocking event with security context
                this.addAuditLog(ip, "RATE_LIMIT_EXCEEDED", endpoint, false);
                this.logSecurityEvent('MEDIUM', ip, `Rate limit exceeded for ${endpoint}: ${newCount} requests in ${this.rateLimitWindow/1000}s`, true);
                
                return { allowed: false, error: "Too many requests. Please try again later." };
            }
            
            // Update count and timestamp
            const updateQuery = `UPDATE rate_limits SET count = ?, lastRequest = ? WHERE ipHash = ? AND endpoint = ?`;
            this.sql.execute(updateQuery, [newCount, now, ipHash, endpoint]);
            
            // Log approaching rate limit for monitoring
            if (newCount >= Math.floor(this.maxRequestsPerWindow * 0.8)) {
                this.logger.warn(`IP ${this.maskIP(ip)} approaching rate limit: ${newCount}/${this.maxRequestsPerWindow} on ${endpoint}`);
            }
            
            return { allowed: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Rate limit check error: ${errorMessage}`);
            
            // Log the error as a security event
            this.logSecurityEvent('LOW', ip, `Rate limit check error: ${errorMessage}`, false);
            
            // On error, allow the request to proceed but with monitoring
            return { allowed: true };
        }
    }
    
    /**
     * Add an entry to the audit log with enhanced details.
     * Only the masked IP is stored.
     */
    private addAuditLog(ip: string, action: string, details: string, success: boolean): void {
        try {
            const timestamp = Date.now();
            const maskedIp = this.maskIP(ip);
            
            // Add request ID for correlation across logs
            const requestId = crypto.randomBytes(8).toString('hex');
            
            // Store in database
            const query = `INSERT INTO audit_log (timestamp, maskedIp, action, details, success) VALUES (?, ?, ?, ?, ?)`;
            this.sql.execute(query, [timestamp, maskedIp, action, details, success ? 1 : 0]);
            
            // Log to console with appropriate level
            const logMethod = success ? 'info' : 'warn';
            this.logger[logMethod](`AUDIT [${requestId}] ${action} | IP: ${maskedIp} | ${success ? 'SUCCESS' : 'FAILED'} | ${details}`);
            
            // Track suspicious activity for failed actions
            if (!success) {
                this.trackSuspiciousActivity(ip, action);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error adding audit log: ${errorMessage}`);
        }
    }
    
    /**
     * Log security events with severity levels
     * Optionally writes to a dedicated security log file
     */
    private logSecurityEvent(severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', ip: string, event: string, attempted: boolean): void {
        try {
            const timestamp = new Date().toISOString();
            const maskedIp = ip === 'system' ? 'SYSTEM' : this.maskIP(ip);
            const logMessage = `[SECURITY:${severity}] ${timestamp} | ${maskedIp} | ${event} | ${attempted ? 'ATTEMPTED' : 'DETECTED'}`;
            
            // Always log to console
            if (severity === 'CRITICAL' || severity === 'HIGH') {
                this.logger.error(logMessage);
            } else if (severity === 'MEDIUM') {
                this.logger.warn(logMessage);
            } else {
                this.logger.info(logMessage);
            }
            
            // Log to security file if configured
            if (this.securityLogFile) {
                try {
                    fs.appendFileSync(
                        path.resolve(this.securityLogFile),
                        `${logMessage}\n`
                    );
                } catch (fileError) {
                    this.logger.error(`Failed to write to security log file: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
                }
            }
            
            // Add to audit log for database record
            this.addAuditLog(ip, `SECURITY_${severity}`, event, false);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error logging security event: ${errorMessage}`);
        }
    }
    
    /**
     * Track suspicious activity from an IP address
     * Logs security events when threshold is exceeded
     */
    private trackSuspiciousActivity(ip: string, action: string): void {
        if (ip === 'unknown' || ip === 'system') return;
        
        const ipHash = this.hashIP(ip);
        const currentCount = this.suspiciousIPs.get(ipHash) || 0;
        const newCount = currentCount + 1;
        
        this.suspiciousIPs.set(ipHash, newCount);
        
        // Log suspicious activity when threshold is reached
        if (newCount === this.suspiciousActivityThreshold) {
            this.logSecurityEvent('MEDIUM', ip, `Suspicious activity threshold reached: ${action}`, true);
        } else if (newCount >= this.suspiciousActivityThreshold * 2) {
            this.logSecurityEvent('HIGH', ip, `Continued suspicious activity: ${action}`, true);
            
            // Reset counter to prevent log flooding
            this.suspiciousIPs.set(ipHash, 0);
        }
    }
    
    /**
     * Sanitize and validate input data
     */
    private sanitizeInput(data: string, type?: 'id' | 'url' | 'general'): string {
        if (!data || typeof data !== 'string') {
            return '';
        }
        
        // Trim whitespace
        const trimmed = data.trim();
        
        // Apply type-specific validation
        switch (type) {
            case 'id':
                // For IDs: alphanumeric, underscore, dash, dot only
                if (!/^[\w\-\.]+$/i.test(trimmed)) {
                    this.logger.warn(`Invalid ID format rejected: ${this.truncateForLogging(trimmed)}`);
                    return '';
                }
                break;
                
            case 'url':
                // For URLs: basic URL validation
                try {
                    new URL(trimmed);
                    // Additional check for dangerous protocols
                    if (trimmed.match(/^(javascript|data|vbscript|file):/i)) {
                        this.logger.warn(`Potentially dangerous URL rejected: ${this.truncateForLogging(trimmed)}`);
                        return '';
                    }
                } catch (e) {
                    this.logger.warn(`Invalid URL format rejected: ${this.truncateForLogging(trimmed)}`);
                    return '';
                }
                break;
                
            default:
                // General sanitization: remove dangerous characters
                break;
        }
        
        // Remove potentially dangerous characters for all types
        return trimmed.replace(/[\<\>\&\"\'\`\;\{\}\[\]\(\)\$\#\~\|]/g, '');
    }
    
    /**
     * Truncate long strings for safe logging
     */
    private truncateForLogging(str: string, maxLength: number = 50): string {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }
    
    /**
     * Mask an IP address for logging with enhanced privacy protection.
     * For IPv4, e.g., 192.168.1.1 -> 192.168.xxx.xxx.
     * For IPv6, first two segments are preserved, rest are masked.
     * @param ip IP address to mask
     * @returns Masked IP address safe for logging
     */
    private maskIP(ip: string): string {
        if (!ip || ip === 'unknown' || ip === 'system') {
            return 'unknown';
        }
        
        try {
            // Handle IPv4 addresses
            if (ip.includes('.')) {
                const parts = ip.split('.');
                if (parts.length === 4) {
                    // Keep first two octets, mask the rest
                    return `${parts[0]}.${parts[1]}.xxx.xxx`;
                }
            } 
            // Handle IPv6 addresses
            else if (ip.includes(':')) {
                const parts = ip.split(':');
                if (parts.length > 2) {
                    // Keep first two segments, mask the rest
                    return `${parts[0]}:${parts[1]}:xxxx:xxxx:xxxx`;
                }
            }
            
            // For non-standard formats, mask most of the string
            // Keep first 3 and last 3 characters only
            if (ip.length > 8) {
                return `${ip.substring(0, 3)}...${ip.substring(ip.length - 3)}`;
            } else if (ip.length > 3) {
                return `${ip.substring(0, 2)}...`;
            }
            
            // For very short strings, return generic mask
            return 'xxx';
        } catch (error) {
            // Failsafe return value
            this.logger.error(`Error masking IP: ${error instanceof Error ? error.message : String(error)}`);
            return 'xxx.xxx.xxx.xxx';
        }
    }
    
    /**
     * Add a new provider with enhanced validation, duplication handling and rate limiting.
     * Includes additional security checks and detailed logging.
     */
    addProvider(setupUrl: string, setupJSON: PluginSetupJSON, clientIp: string = "unknown"): { success: boolean; id?: string; error?: string } {
        const startTime = Date.now();
        const requestId = crypto.randomBytes(4).toString('hex');
        
        try {
            this.logger.info(`[${requestId}] Provider add request from ${this.maskIP(clientIp)}`);
            
            // Check rate limits
            const rateCheck = this.checkRateLimit(clientIp, "addProvider");
            if (!rateCheck.allowed) {
                return { success: false, error: rateCheck.error };
            }
            
            // Enhanced input validation
            const sanitizedUrl = this.sanitizeInput(setupUrl, 'url');
            let sanitizedId = '';
            
            // Validate setupJSON structure
            if (!setupJSON || typeof setupJSON !== 'object') {
                this.addAuditLog(clientIp, "ADD_PROVIDER_INVALID_JSON", "Invalid setupJSON structure", false);
                return { success: false, error: "Invalid provider configuration" };
            }
            
            // Validate ID separately
            if (!setupJSON.id || typeof setupJSON.id !== 'string') {
                this.addAuditLog(clientIp, "ADD_PROVIDER_MISSING_ID", JSON.stringify({ setupUrl }), false);
                return { success: false, error: "Provider ID is required" };
            }
            
            sanitizedId = this.sanitizeInput(setupJSON.id, 'id');
            
            // Comprehensive validation
            if (!sanitizedUrl) {
                this.addAuditLog(clientIp, "ADD_PROVIDER_INVALID_URL", setupUrl, false);
                return { success: false, error: "Invalid setup URL format" };
            }
            
            if (!sanitizedId) {
                this.addAuditLog(clientIp, "ADD_PROVIDER_INVALID_ID", setupJSON.id, false);
                return { success: false, error: "Invalid provider ID format" };
            }
            
            // Validate required fields in setupJSON
            if (!this.validateProviderConfig(setupJSON)) {
                this.addAuditLog(clientIp, "ADD_PROVIDER_INVALID_CONFIG", JSON.stringify(setupJSON), false);
                return { success: false, error: "Provider configuration is incomplete or invalid" };
            }
            
            // Check if provider with this ID already exists
            const existingProvider = this.getProvider(sanitizedId, clientIp);
            if (existingProvider) {
                this.addAuditLog(clientIp, "ADD_PROVIDER_DUPLICATE", sanitizedId, false);
                return { success: false, error: `Provider with ID ${sanitizedId} already exists` };
            }
            
            // Prepare data for insertion
            const safeSetupJSON = { ...setupJSON, id: sanitizedId };
            const query = `INSERT INTO providers (id, setupUrl, setupJSON) VALUES (?, ?, ?)`;
            const result = this.sql.execute(query, [sanitizedId, sanitizedUrl, JSON.stringify(safeSetupJSON)]);
            
            if (result.changes && result.changes > 0) {
                const duration = Date.now() - startTime;
                this.logger.info(`[${requestId}] Added provider: ${sanitizedId} (${duration}ms)`);
                this.addAuditLog(clientIp, "ADD_PROVIDER_SUCCESS", sanitizedId, true);
                return { success: true, id: sanitizedId };
            } else {
                this.addAuditLog(clientIp, "ADD_PROVIDER_FAILED", sanitizedId, false);
                return { success: false, error: "Failed to add provider" };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[${requestId}] Error adding provider: ${errorMessage}`);
            
            // Log stack trace for debugging in development
            if (process.env.NODE_ENV === "development" && error instanceof Error && error.stack) {
                this.logger.error(`Stack trace: ${error.stack}`);
            }
            
            this.addAuditLog(clientIp, "ADD_PROVIDER_ERROR", errorMessage, false);
            return { success: false, error: "An error occurred while adding the provider" };
        }
    }
    
    /**
     * Validate provider configuration
     * Ensures all required fields are present and valid
     */
    private validateProviderConfig(config: PluginSetupJSON): boolean {
        // Basic structure validation
        if (!config || typeof config !== 'object') return false;
        
        // Check required fields individually with proper type checking
        if (!config.id || typeof config.id !== 'string') {
            this.logger.warn('Provider config missing required field: id');
            return false;
        }
        
        if (!config.name || typeof config.name !== 'string') {
            this.logger.warn('Provider config missing required field: name');
            return false;
        }
        
        if (!config.version || typeof config.version !== 'string') {
            this.logger.warn('Provider config missing required field: version');
            return false;
        }
        
        // Validate version format (semver-like)
        if (!/^\d+\.\d+(\.\d+)?$/.test(config.version)) {
            this.logger.warn(`Provider has invalid version format: ${config.version}`);
            return false;
        }
        
        return true;
    }
    
    /**
     * Delete a provider by ID with rate limiting.
     */
    deleteProvider(id: string, clientIp: string = "unknown"): { success: boolean; changes?: number; error?: string } {
        try {
            const rateCheck = this.checkRateLimit(clientIp, "deleteProvider");
            if (!rateCheck.allowed) {
                return { success: false, error: rateCheck.error };
            }
            
            const sanitizedId = this.sanitizeInput(id);
            if (!sanitizedId) {
                this.addAuditLog(clientIp, "DELETE_PROVIDER_INVALID_ID", id, false);
                return { success: false, error: "Invalid provider ID" };
            }
            
            const query = `DELETE FROM providers WHERE id = ?`;
            const result = this.sql.execute(query, [sanitizedId]);
            
            if (result.changes && result.changes > 0) {
                this.logger.info(`Deleted provider: ${sanitizedId}`);
                this.addAuditLog(clientIp, "DELETE_PROVIDER_SUCCESS", sanitizedId, true);
                return { success: true, changes: result.changes };
            } else {
                this.addAuditLog(clientIp, "DELETE_PROVIDER_NOT_FOUND", sanitizedId, false);
                return { success: false, error: `Provider with ID ${sanitizedId} not found` };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error deleting provider: ${errorMessage}`);
            this.addAuditLog(clientIp, "DELETE_PROVIDER_ERROR", `${id}: ${errorMessage}`, false);
            return { success: false, error: errorMessage };
        }
    }
    
    /**
     * Get a provider by ID with rate limiting.
     */
    getProvider(id: string, clientIp: string = "unknown"): ProviderDB | null {
        try {
            if (clientIp !== "unknown") {
                const rateCheck = this.checkRateLimit(clientIp, "getProvider");
                if (!rateCheck.allowed) {
                    this.logger.warn(`Rate limit exceeded for getProvider by ${clientIp}`);
                    return null;
                }
            }
            
            const sanitizedId = this.sanitizeInput(id);
            if (!sanitizedId) {
                if (clientIp !== "unknown") {
                    this.addAuditLog(clientIp, "GET_PROVIDER_INVALID_ID", id, false);
                }
                return null;
            }
            
            const query = `SELECT id, setupUrl, setupJSON FROM providers WHERE id = ?`;
            const result = this.sql.queryOne<{ id: string; setupUrl: string; setupJSON: string }>(query, [sanitizedId]);
            
            if (result) {
                if (clientIp !== "unknown") {
                    this.addAuditLog(clientIp, "GET_PROVIDER_SUCCESS", sanitizedId, true);
                }
                return {
                    id: result.id,
                    setupUrl: result.setupUrl,
                    setupJSON: JSON.parse(result.setupJSON) as PluginSetupJSON
                };
            }
            
            if (clientIp !== "unknown") {
                this.addAuditLog(clientIp, "GET_PROVIDER_NOT_FOUND", sanitizedId, false);
            }
            return null;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error getting provider: ${errorMessage}`);
            if (clientIp !== "unknown") {
                this.addAuditLog(clientIp, "GET_PROVIDER_ERROR", `${id}: ${errorMessage}`, false);
            }
            return null;
        }
    }
    
    /**
     * Get all providers with rate limiting.
     */
    getProviders(clientIp: string = "unknown"): ProviderDB[] {
        try {
            if (clientIp !== "unknown") {
                const rateCheck = this.checkRateLimit(clientIp, "getProviders");
                if (!rateCheck.allowed) {
                    this.logger.warn(`Rate limit exceeded for getProviders by ${clientIp}`);
                    return [];
                }
            }
            
            const query = `SELECT id, setupUrl, setupJSON FROM providers`;
            const result = this.sql.query<{ id: string; setupUrl: string; setupJSON: string }>(query);
            
            if (clientIp !== "unknown") {
                this.addAuditLog(clientIp, "GET_PROVIDERS_SUCCESS", `Retrieved ${result.data.length} providers`, true);
            }
            
            return result.data.map(item => ({
                id: item.id,
                setupUrl: item.setupUrl,
                setupJSON: JSON.parse(item.setupJSON) as PluginSetupJSON
            }));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error getting providers: ${errorMessage}`);
            if (clientIp !== "unknown") {
                this.addAuditLog(clientIp, "GET_PROVIDERS_ERROR", errorMessage, false);
            }
            return [];
        }
    }
    
    /**
     * Update an existing provider with rate limiting.
     */
    updateProvider(id: string, setupUrl: string, setupJSON: PluginSetupJSON, clientIp: string = "unknown"): { success: boolean; changes?: number; error?: string } {
        try {
            const rateCheck = this.checkRateLimit(clientIp, "updateProvider");
            if (!rateCheck.allowed) {
                return { success: false, error: rateCheck.error };
            }
            
            const sanitizedId = this.sanitizeInput(id);
            const sanitizedUrl = this.sanitizeInput(setupUrl);
            
            if (!sanitizedId || !sanitizedUrl || !setupJSON) {
                this.addAuditLog(clientIp, "UPDATE_PROVIDER_INVALID_INPUT", JSON.stringify({ id, setupUrl }), false);
                return { success: false, error: "Invalid input data" };
            }
            
            const existingProvider = this.getProvider(sanitizedId, clientIp);
            if (!existingProvider) {
                this.addAuditLog(clientIp, "UPDATE_PROVIDER_NOT_FOUND", sanitizedId, false);
                return { success: false, error: `Provider with ID ${sanitizedId} not found` };
            }
            
            const query = `UPDATE providers SET setupUrl = ?, setupJSON = ? WHERE id = ?`;
            const result = this.sql.execute(query, [sanitizedUrl, JSON.stringify(setupJSON), sanitizedId]);
            
            if (result.changes && result.changes > 0) {
                this.logger.info(`Updated provider: ${sanitizedId}`);
                this.addAuditLog(clientIp, "UPDATE_PROVIDER_SUCCESS", sanitizedId, true);
                return { success: true, changes: result.changes };
            } else {
                this.addAuditLog(clientIp, "UPDATE_PROVIDER_NO_CHANGES", sanitizedId, false);
                return { success: false, error: "No changes made to provider" };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error updating provider: ${errorMessage}`);
            this.addAuditLog(clientIp, "UPDATE_PROVIDER_ERROR", `${id}: ${errorMessage}`, false);
            return { success: false, error: errorMessage };
        }
    }
    
    /**
     * Get audit logs with pagination.
     * Only accessible for authenticated admin users with enhanced security controls.
     * @param page Page number (1-based)
     * @param limit Results per page
     * @param clientIp Client IP address for rate limiting and auditing
     * @param filters Optional filters for audit log entries
     * @returns Array of audit log entries or empty array if access denied
     */
    getAuditLogs(
        page: number = 1, 
        limit: number = 50, 
        clientIp: string = "unknown",
        filters?: { action?: string; startTime?: number; endTime?: number; success?: boolean }
    ): AuditLogEntry[] {
        const requestId = crypto.randomBytes(4).toString('hex');
        
        try {
            // Security check: Unknown IPs cannot access audit logs
            if (clientIp === "unknown") {
                this.logSecurityEvent('MEDIUM', 'unknown', 'Attempted to access audit logs without IP', true);
                return [];
            }
            
            // Rate limit check with specific endpoint
            const rateCheck = this.checkRateLimit(clientIp, "getAuditLogs");
            if (!rateCheck.allowed) {
                this.logSecurityEvent('LOW', clientIp, 'Rate limited access to audit logs', true);
                return [];
            }
            
            // Log access attempt for security monitoring
            this.logger.info(`[${requestId}] Audit log access from ${this.maskIP(clientIp)}`);
            
            // Input validation with safe defaults
            const validPage = Math.max(1, Math.min(1000, page)); // Prevent excessive pagination
            const validLimit = Math.min(100, Math.max(1, limit)); // Cap at 100 results
            const offset = (validPage - 1) * validLimit;
            
            // Build query with optional filters
            let query = `
                SELECT id, timestamp, maskedIp, action, details, success 
                FROM audit_log 
                WHERE 1=1
            `;
            
            const queryParams: Array<string | number> = [];
            
            // Apply filters if provided (with SQL injection protection)
            if (filters) {
                if (filters.action) {
                    const safeAction = this.sanitizeInput(filters.action);
                    if (safeAction) {
                        query += ` AND action = ?`;
                        queryParams.push(safeAction);
                    }
                }
                
                if (filters.startTime && typeof filters.startTime === 'number') {
                    query += ` AND timestamp >= ?`;
                    queryParams.push(filters.startTime);
                }
                
                if (filters.endTime && typeof filters.endTime === 'number') {
                    query += ` AND timestamp <= ?`;
                    queryParams.push(filters.endTime);
                }
                
                if (typeof filters.success === 'boolean') {
                    query += ` AND success = ?`;
                    queryParams.push(filters.success ? 1 : 0);
                }
            }
            
            // Add sorting and pagination
            query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
            queryParams.push(validLimit, offset);
            
            // Execute query with all parameters
            const result = this.sql.query<AuditLogEntry>(query, queryParams);
            
            // Log successful access
            this.addAuditLog(
                clientIp, 
                "GET_AUDIT_LOGS", 
                `Page: ${validPage}, Limit: ${validLimit}, Results: ${result.data.length}`, 
                true
            );
            
            // Return results
            return result.data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[${requestId}] Error getting audit logs: ${errorMessage}`);
            
            // Log as security event
            this.logSecurityEvent('LOW', clientIp, `Audit log access error: ${errorMessage}`, false);
            
            // Return empty array on error
            return [];
        }
    }
    
    /**
     * Clear rate limit blocks for testing purposes.
     * Enhanced with additional security checks and comprehensive logging.
     * Only available in development environment with authorized IPs.
     * @param clientIp Client IP address for authorization and auditing
     * @param adminKey Optional admin key for additional authorization
     * @returns Success status and message
     */
    clearRateLimitBlocks(clientIp: string = "unknown", adminKey?: string): { success: boolean; message?: string } {
        const requestId = crypto.randomBytes(4).toString('hex');
        this.logger.warn(`[${requestId}] Rate limit clear attempt from ${this.maskIP(clientIp)}`);
        
        // Environment check - only allowed in development
        const isDevelopment = process.env.NODE_ENV === "development" || Bun.env.NODE_ENV === "development";
        if (!isDevelopment) {
            this.logSecurityEvent('HIGH', clientIp, "Attempted to clear rate limits in production", true);
            this.addAuditLog(clientIp, "CLEAR_RATE_LIMITS_DENIED", "Not allowed in production", false);
            return { success: false, message: "This operation is only available in development environment" };
        }
        
        // IP allowlist check - can be configured via environment variable
        const allowedIPs = (process.env.ADMIN_IPS || Bun.env.ADMIN_IPS || "127.0.0.1,::1").split(',');
        if (clientIp !== "unknown" && !allowedIPs.includes(clientIp)) {
            this.logSecurityEvent('HIGH', clientIp, "Unauthorized IP attempted admin operation", true);
            this.addAuditLog(clientIp, "CLEAR_RATE_LIMITS_DENIED", "Unauthorized IP", false);
            return { success: false, message: "Unauthorized access" };
        }
        
        // Admin key check if provided
        const configuredAdminKey = process.env.ADMIN_KEY || Bun.env.ADMIN_KEY;
        if (configuredAdminKey && adminKey !== configuredAdminKey) {
            this.logSecurityEvent('HIGH', clientIp, "Invalid admin key used", true);
            this.addAuditLog(clientIp, "CLEAR_RATE_LIMITS_DENIED", "Invalid admin key", false);
            return { success: false, message: "Invalid admin key" };
        }
        
        try {
            // Get count of blocked IPs before clearing for logging
            const countQuery = `SELECT COUNT(*) as blocked_count FROM rate_limits WHERE blocked = 1`;
            const countResult = this.sql.queryOne<{blocked_count: number}>(countQuery);
            const blockedCount = countResult?.blocked_count || 0;
            
            // Clear all rate limits
            const query = `UPDATE rate_limits SET blocked = 0, count = 0, lastRequest = ?`;
            const result = this.sql.execute(query, [Date.now()]);
            
            // Enhanced logging with detailed information
            this.logger.info(`[${requestId}] Rate limits cleared: ${blockedCount} blocked IPs affected`);
            this.addAuditLog(clientIp, "CLEAR_RATE_LIMITS", `All rate limit blocks cleared (${blockedCount} IPs unblocked)`, true);
            this.logSecurityEvent('MEDIUM', clientIp, `Rate limits manually cleared: ${blockedCount} IPs unblocked`, false);
            
            return { 
                success: true, 
                message: `Successfully cleared rate limits for ${blockedCount} blocked IPs` 
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[${requestId}] Error clearing rate limits: ${errorMessage}`);
            this.logSecurityEvent('LOW', clientIp, `Error clearing rate limits: ${errorMessage}`, false);
            return { success: false, message: "An error occurred while clearing rate limits" };
        }
    }

    /**
     * Search providers based on search criteria with rate limiting and security measures
     * @param searchParams Search parameters (id, url, or setupJSON fields)
     * @param clientIp Client IP for rate limiting
     * @returns Array of matching providers and metadata
     */
    searchProviders(searchParams:  ProviderDBSearch, clientIp: string = "unknown"): { success: boolean; providers?: ProviderDB[]; error?: string } {
        const requestId = crypto.randomBytes(4).toString('hex');
        
        try {
            this.logger.info(`[${requestId}] Provider search request from ${this.maskIP(clientIp)}`);
            
            // Check rate limits
            const rateCheck = this.checkRateLimit(clientIp, "searchProviders");
            if (!rateCheck.allowed) {
                return { success: false, error: rateCheck.error };
            }
            
            // Build base query
            let query = 'SELECT * FROM providers WHERE 1=1';
            const params: string[] = [];
            
            // Add search conditions with sanitized inputs
            if (searchParams.id) {
                const sanitizedId = this.sanitizeInput(searchParams.id, 'id');
                if (sanitizedId) {
                    query += ' AND id LIKE ?';
                    params.push(`%${sanitizedId}%`);
                }
            }
            
            if (searchParams.setupUrl) {
                const sanitizedUrl = this.sanitizeInput(searchParams.setupUrl, 'url');
                if (sanitizedUrl) {
                    query += ' AND setupUrl LIKE ?';
                    params.push(`%${sanitizedUrl}%`);
                }
            }
            
            // Handle setupJSON field searches
            if (searchParams.setupJSON) {
                const setupJSON = searchParams.setupJSON;
                
                // Search by name
                if (setupJSON.name) {
                    const sanitizedName = this.sanitizeInput(setupJSON.name, 'general');
                    if (sanitizedName) {
                        query += " AND json_extract(setupJSON, '$.name') LIKE ?";
                        params.push(`%${sanitizedName}%`);
                    }
                }
                
                // Search by description
                if (setupJSON.description) {
                    const sanitizedDesc = this.sanitizeInput(setupJSON.description, 'general');
                    if (sanitizedDesc) {
                        query += " AND json_extract(setupJSON, '$.description') LIKE ?";
                        params.push(`%${sanitizedDesc}%`);
                    }
                }
                
                // Search by version
                if (setupJSON.version) {
                    const sanitizedVersion = this.sanitizeInput(setupJSON.version, 'general');
                    if (sanitizedVersion) {
                        query += " AND json_extract(setupJSON, '$.version') LIKE ?";
                        params.push(`%${sanitizedVersion}%`);
                    }
                }
                
                // Search by author name
                if (setupJSON.author?.name) {
                    const sanitizedAuthor = this.sanitizeInput(setupJSON.author.name, 'general');
                    if (sanitizedAuthor) {
                        query += " AND json_extract(setupJSON, '$.author.name') LIKE ?";
                        params.push(`%${sanitizedAuthor}%`);
                    }
                }
                
                // Search by multiple_choice flag
                if (typeof setupJSON.multiple_choice === 'boolean') {
                    query += " AND json_extract(setupJSON, '$.multiple_choice') = ?";
                    params.push(setupJSON.multiple_choice ? '1' : '0');
                }
            }
            
            // Execute search query
            const result = this.sql.query<ProviderDB>(query, params);
            
            // Parse setupJSON for each provider
            const providers = result.data.map(provider => ({
                ...provider,
                setupJSON: JSON.parse(provider.setupJSON as unknown as string)
            }));
            
            // Log successful search
            this.addAuditLog(clientIp, "SEARCH_PROVIDERS", 
                `Found ${providers.length} providers matching criteria`, true);
            
            return { success: true, providers };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[${requestId}] Provider search failed: ${errorMessage}`);
            
            // Log the error as a security event if it seems suspicious
            if (errorMessage.includes('syntax') || errorMessage.includes('malformed')) {
                this.logSecurityEvent('LOW', clientIp, `Suspicious search attempt: ${errorMessage}`, true);
            }
            
            this.addAuditLog(clientIp, "SEARCH_PROVIDERS_FAILED", errorMessage, false);
            return { success: false, error: "Failed to search providers" };
        }
    }
}

export const providers = new Providers();
