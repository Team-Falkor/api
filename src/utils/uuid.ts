import crypto from "crypto";

/**
 * Generates a RFC 4122 compliant UUID v4 (random-based)
 *
 * @returns A randomly generated UUID string
 */
export function generateUUID(): string {
  // Generate 16 random bytes
  const bytes = crypto.randomBytes(16);

  // Set the version (4) and variant (RFC4122) bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC4122

  // Convert to hex string with proper formatting
  const hex = bytes.toString("hex");
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join("-");
}

/**
 * Validates if a string is a valid UUID
 *
 * @param uuid The string to validate
 * @returns True if the string is a valid UUID, false otherwise
 */
export function isValidUUID(uuid: unknown) {
  const uuidRegex =
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

  return typeof uuid === "string" && uuidRegex.test(uuid);
}
