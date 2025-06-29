import { t } from "elysia";

export namespace AnalyticsAdminModel {
	// Data retention settings
	export const dataRetentionSchema = t.Object({
		dataType: t.Union([
			t.Literal("pageview"),
			t.Literal("event"),
			t.Literal("metrics"),
		]),
		retentionDays: t.Number({
			minimum: 1,
			error() {
				return "Retention days must be at least 1.";
			},
		}),
	});

	// Aggregate metrics structure
	export const aggregateMetricsSchema = t.Object({
		metricType: t.String(),
		value: t.Number(),
		period: t.String(),
		startTime: t.Date(),
		endTime: t.Date(),
	});

	// Time range for queries
	export const timeRangeSchema = t.Object({
		from: t.Optional(t.Date()),
		to: t.Optional(t.Date()),
	});

	// Type definitions for convenience
	export type DataRetention = typeof dataRetentionSchema.static;
	export type AggregateMetrics = typeof aggregateMetricsSchema.static;
	export type TimeRange = typeof timeRangeSchema.static;
}