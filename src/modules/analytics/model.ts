import { t } from "elysia";

export namespace AnalyticsModel {
	// Re-usable sessionId schema
	export const sessionIdSchema = t.String({
		minLength: 36,
		maxLength: 36,
		error() {
			return "Invalid sessionId format.";
		},
	});

	// Pageview event data
	export const pageviewSchema = t.Object({
		path: t.String({
			minLength: 1,
			error() {
				return "Path must be at least 1 character long.";
			},
		}),
		sessionId: sessionIdSchema,
		userAgent: t.Optional(t.String()),
		countryCode: t.Optional(t.String()),
	});

	// Generic event data
	export const eventSchema = t.Object({
		eventType: t.String(),
		path: t.String(),
		sessionId: sessionIdSchema,
		context: t.Optional(t.Any()),
	});

	// Type definitions for convenience
	export type SessionId = typeof sessionIdSchema.static;

	export type Pageview = typeof pageviewSchema.static;
	export type Event = typeof eventSchema.static;
}
