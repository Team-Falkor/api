import type { Context } from "elysia";

/**
 * Normalizes raw IP input:
 * - Returns `undefined` for null/empty
 * - Trims whitespace, lowercases
 * - Strips port suffixes (":3000") and IPv6 zone IDs ("%eth0")
 * - Maps all localhost variants to "localhost"
 */
export function normalizeIp(raw?: string | null): string | undefined {
	if (!raw) return undefined;

	// Trim, lowercase, split off commas (proxies), take first
	let ip = raw.split(",")[0].trim().toLowerCase();

	// Drop port if any (":1234")
	ip = ip.replace(/:\d+$/, "");

	// Drop IPv6 zone if any ("%eth0")
	ip = ip.replace(/%.*$/, "");

	// Collapse all localhost forms
	const isIpv4Loopback = ip.startsWith("127.");
	const isIpv6Loopback =
		ip === "::1" ||
		ip === "::" ||
		ip === ":" ||
		ip === "0:0:0:0:0:0:0:1" ||
		ip.startsWith("::ffff:127.");
	const isHostnameLocal = ip === "localhost";

	if (isHostnameLocal || isIpv4Loopback || isIpv6Loopback) {
		return "localhost";
	}

	return ip || undefined;
}

/**
 * Returns the client IP by using Elysia's built‑in requestIP.
 */
export const getClientIp = (ctx: Context): string | undefined =>
	normalizeIp(
		ctx.headers["x-forwarded-for"] ??
			ctx.headers["x-real-ip"] ??
			ctx.headers["cf-connecting-ip"] ??
			ctx.server?.requestIP(ctx.request)?.address,
	);
