// utils/jwt.ts
import { JWTPayloadSpec } from "@elysiajs/jwt";

export function isValidJWTPayload(
  payload: unknown
): payload is JWTPayloadSpec & { sub: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "sub" in payload &&
    typeof (payload as any).sub === "string"
  );
}
