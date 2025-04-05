/**
 * SQL related type definitions
 */

/**
 * Interface for SQL query results
 */
export interface SQLQueryResult<T = unknown> {
  data: T[];
  lastInsertId?: number;
  changes?: number;
}

/**
 * Interface for SQL connection options
 */
export interface SQLConnectionOptions {
  readonly?: boolean;
  create?: boolean;
  timeout?: number;
}

/**
 * Interface for SQL error details
 */
export interface SQLError extends Error {
  code?: string;
  errno?: number;
  sqlMessage?: string;
  sqlState?: string;
}