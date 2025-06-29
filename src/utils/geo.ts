import { lookup } from "ip-location-api";

/**
 * Lookup 2‑letter ISO country code from an IP.
 */
export async function getCountryCodeFromIp(
  ip: string | null | undefined
): Promise<string> {
  if (!ip) return "unknown";

  const location = await lookup(ip);
  if (!location) return "unknown";

  return location.country ?? "unknown";
}