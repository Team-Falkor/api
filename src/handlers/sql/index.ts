import sql, { Database, Statement, type SQLQueryBindings } from "bun:sqlite";
import { Console } from "../../utils/console";
import type { SQLQueryResult, SQLConnectionOptions, SQLError } from "../../@types/sql";

/**
 * Re-export SQL types for convenience
 */
export type { SQLQueryResult, SQLConnectionOptions, SQLError } from "../../@types/sql";

/**
 * SQLHelper class for handling SQLite database operations
 * with proper error handling and connection management
 */
export class SQLHelper {
  private db: Database | null = null;
  private logger = new Console({ prefix: "SQLHelper" });
  private options: SQLConnectionOptions;

  /**
   * Constructor for SQLHelper
   * @param dbPath Path to the SQLite database file
   * @param options Connection options
   */
  constructor(private dbPath: string, options?: SQLConnectionOptions) {
    this.options = options || {};
    this.connect();
  }

  /**
   * Connect to the SQLite database
   * @returns True if connection successful, false otherwise
   */
  public connect(): boolean {
    try {
      this.db = new Database(this.dbPath, {
        readonly: this.options.readonly || false,
        create: this.options.create !== false, // Default to true
        ...this.options
      });
      return true;
    } catch (error) {
      this.handleError("Failed to connect to database", error);
      return false;
    }
  }

  /**
   * Close the database connection
   */
  public close(): void {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
      }
    } catch (error) {
      this.handleError("Failed to close database connection", error);
    }
  }

  /**
   * Execute a query that returns data
   * @param query SQL query string
   * @param params Query parameters
   * @returns Query result object
   */
  public query<T = unknown>(query: string, params: SQLQueryBindings[] = []): SQLQueryResult<T> {
    try {
      this.ensureConnection();
      const stmt = this.db!.prepare(query);
      const data = stmt.all(...params) as T[];
      stmt.finalize();
      return {
        data,
        lastInsertId: 0,
        changes: 0
      };
    } catch (error) {
      this.handleError(`Query failed: ${query}`, error);
      return { data: [] };
    }
  }

  /**
   * Execute a query that doesn't return data (INSERT, UPDATE, DELETE)
   * @param query SQL query string
   * @param params Query parameters
   * @returns Object with lastInsertId and changes count
   */
  public execute(query: string, params: SQLQueryBindings[] = []): Omit<SQLQueryResult, "data"> {
    try {
      this.ensureConnection();
      const stmt = this.db!.prepare(query);
      const result = stmt.run(...params);
      stmt.finalize();
      return {
        lastInsertId: Number(result.lastInsertRowid),
        changes: result.changes
      };
    } catch (error) {
      this.handleError(`Execute failed: ${query}`, error);
      return { lastInsertId: 0, changes: 0 };
    }
  }

  /**
   * Execute a single query that returns one row
   * @param query SQL query string
   * @param params Query parameters
   * @returns Single result or null
   */
  public queryOne<T = unknown>(query: string, params: SQLQueryBindings[] = []): T | null {
    try {
      this.ensureConnection();
      const stmt = this.db!.prepare(query);
      const result = stmt.get(...params) as T | null;
      stmt.finalize();
      return result !== undefined ? result : null;
    } catch (error) {
      this.handleError(`QueryOne failed: ${query}`, error);
      return null;
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param callback Function containing queries to execute in transaction
   * @returns True if transaction successful, false otherwise
   */
  public transaction(callback: () => void): boolean {
    try {
      this.ensureConnection();
      this.db!.transaction(callback)();
      return true;
    } catch (error) {
      this.handleError("Transaction failed", error);
      return false;
    }
  }

  /**
   * Ensure database connection exists
   */
  private ensureConnection(): void {
    if (!this.db) {
      const connected = this.connect();
      if (!connected) {
        throw new Error("Database connection not available");
      }
    }
  }

  /**
   * Handle and log errors
   * @param message Error context message
   * @param error Error object
   */
  private handleError(message: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`${message}: ${errorMessage}`);
    
    // Additional SQL-specific error handling
    if (error instanceof Error) {
      const sqlError: Partial<SQLError> = error;
      if (sqlError.code || sqlError.sqlMessage) {
        this.logger.error(
          "SQL Error Details: " +
            JSON.stringify({
              code: sqlError.code,
              sqlState: sqlError.sqlState,
              sqlMessage: sqlError.sqlMessage
            })
        );
      }
    }
  }
}
