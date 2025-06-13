import crypto from "node:crypto";

/**
 * Generates a RFC 4122–compliant, cryptographically secure UUID v4.
 *
 * @returns A randomly generated UUID string
 */
export function generateUUID(): string {
	// Native OS-backed CSPRNG, non-blocking
	return crypto.randomUUID();
}

/**
 * Strictly validates only UUIDv4 strings.
 *
 * • Rejects nil (000…0), max (FFF…F), non-v4, and other variants
 */
export function isValidUUID(uuid: unknown): uuid is string {
	if (typeof uuid !== "string") return false;
	const uuidV4Regex =
		/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
	return uuidV4Regex.test(uuid);
}

/**
 * Compare two UUIDs in constant time to avoid timing attacks.
 */
export function compareUUIDs(a: string, b: string): boolean {
	if (!isValidUUID(a) || !isValidUUID(b)) return false;
	const bufA = Buffer.from(a.replace(/-/g, ""), "hex");
	const bufB = Buffer.from(b.replace(/-/g, ""), "hex");
	return crypto.timingSafeEqual(bufA, bufB);
}
