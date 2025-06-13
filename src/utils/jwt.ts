// utils/jwt.ts
import type { JWTPayloadSpec } from "@elysiajs/jwt";

export function isValidJWTPayload(
	payload: unknown,
): payload is JWTPayloadSpec & { sub: string } {
	return (
		typeof payload === "object" &&
		payload !== null &&
		"sub" in payload &&
		typeof payload.sub === "string"
	);
}
