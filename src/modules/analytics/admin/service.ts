import { AnalyticsHandler } from "@/handlers/analytics";
import { prisma } from "@/utils";
import type { AnalyticsAdminModel } from "./model";

const analytics = new AnalyticsHandler();

export namespace AnalyticsAdminService {
	/**
	 * List data retention policies
	 */
	export async function listDataRetention(skip: number = 0, take: number = 10) {
		try {
			const policies = await analytics.listDataRetention(skip, take);
			return {
				success: true,
				data: policies,
			};
		} catch (error: unknown) {
			console.error("Error fetching retention policies:", error);
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to fetch retention policies",
			};
		}
	}

	/**
	 * Get page views with pagination and filtering
	 */
	export async function getPageViews(params: {
		skip: number;
		take: number;
		path?: string;
	}) {
		try {
			const result = await analytics.getPageViews(params);
			return {
				success: true,
				data: result.data,
				meta: {
					total: result.total,
					totalPages: result.totalPages,
					currentPage: Math.floor(params.skip / params.take) + 1,
				},
			};
		} catch (error: unknown) {
			console.error("Error fetching pageviews:", error);
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to fetch pageviews",
			};
		}
	}

	/**
	 * Get events with pagination and filtering
	 */
	export async function getEvents(params: {
		skip: number;
		take: number;
		eventType?: string;
		path?: string;
	}) {
		try {
			const result = await analytics.getEvents(params);
			return {
				success: true,
				data: result.data,
				meta: {
					total: result.total,
					totalPages: result.totalPages,
					currentPage: Math.floor(params.skip / params.take) + 1,
				},
			};
		} catch (error: unknown) {
			console.error("Error fetching events:", error);
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to fetch events",
			};
		}
	}

	/**
	 * Update data retention policy
	 */
	export async function updateDataRetention(
		retentionData: AnalyticsAdminModel.DataRetention,
	) {
		try {
			await analytics.manageDataRetention(
				retentionData.dataType,
				retentionData.retentionDays,
			);
			return {
				success: true,
				message: `Data retention policy updated for ${retentionData.dataType}`,
			};
		} catch (error: unknown) {
			console.error("Error updating retention policy:", error);
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to update data retention policy",
			};
		}
	}

	/**
	 * Get aggregate metrics
	 */
	export async function getAggregateMetrics(params: {
		metricType?: string;
		period?: string;
		startTime?: Date;
		endTime?: Date;
	}) {
		try {
			const metrics = await analytics.getAggregateMetrics(params);
			return {
				success: true,
				data: metrics,
			};
		} catch (error: unknown) {
			console.error("Error fetching aggregate metrics:", error);
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to fetch aggregate metrics",
			};
		}
	}

	/**
	 * Update aggregate metrics
	 */
	export async function updateAggregateMetrics(
		metricsData: AnalyticsAdminModel.AggregateMetrics,
	): Promise<{ success: boolean; message?: string; error?: string }> {
		try {
			await analytics.updateAggregateMetrics(metricsData);
			return {
				success: true,
				message: "Aggregate metrics updated successfully",
			};
		} catch (error: unknown) {
			console.error("Error updating aggregate metrics:", error);
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to update aggregate metrics",
			};
		}
	}

	/**
	 * Get total page views count with optional time range filtering
	 */
	export async function getTotalPageViews(
		timeRange?: AnalyticsAdminModel.TimeRange,
	): Promise<{ success: boolean; data?: number; error?: string }> {
		try {
			const whereClause =
				timeRange?.from || timeRange?.to
					? {
							timestamp: {
								...(timeRange.from && { gte: timeRange.from }),
								...(timeRange.to && { lte: timeRange.to }),
							},
						}
					: {};

			const data = await prisma.pageView.count({ where: whereClause });

			return {
				success: true,
				data,
			};
		} catch (error: unknown) {
			console.error("Error fetching pageviews:", error);
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to fetch pageviews",
			};
		}
	}

	/**
	 * Get total events count with optional time range filtering
	 */
	export async function getTotalEvents(
		timeRange?: AnalyticsAdminModel.TimeRange,
	): Promise<{ success: boolean; data?: number; error?: string }> {
		try {
			const whereClause =
				timeRange?.from || timeRange?.to
					? {
							timestamp: {
								...(timeRange.from && { gte: timeRange.from }),
								...(timeRange.to && { lte: timeRange.to }),
							},
						}
					: {};

			const data = await prisma.eventLog.count({ where: whereClause });

			return {
				success: true,
				data,
			};
		} catch (error: unknown) {
			console.error("Error fetching events:", error);
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to fetch events",
			};
		}
	}
}
