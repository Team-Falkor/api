export const MAX_FAILURES = 5;
export const CONCURRENCY_LIMIT = 10;
export const FETCH_TIMEOUT_MS = 5000;

export const DAYS_IN_WEEK = 7;
export const CHECKS_PER_WEEK = 3;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Calculate the normal interval duration in milliseconds
export const NORMAL_INTERVAL_MS = Math.round(
  (DAYS_IN_WEEK / CHECKS_PER_WEEK) * MS_PER_DAY
); // Approximately 56 hours
