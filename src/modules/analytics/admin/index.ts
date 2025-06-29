import Elysia from "elysia";
import { requireAdminRoute } from "@/plugins/requireAdminRoute";
import { createApiResponse } from "@/utils";
import { AnalyticsAdminModel } from "./model";
import { AnalyticsAdminService } from "./service";

export const analyticsAdminRoutes = new Elysia({ prefix: "/admin" })
	.use(requireAdminRoute)
	//  List Data‑Retention Policies
	.get("/retention", async ({ query, set }) => {
		const skip = Number(query.skip ?? 0);
		const take = Number(query.take ?? 10);

		const result = await AnalyticsAdminService.listDataRetention(skip, take);

		if (result.success) {
			set.status = 200;
			return createApiResponse({
				success: true,
				data: result.data,
			});
		} else {
			set.status = 500;
			return createApiResponse({
				success: false,
				message: result.error || "Failed to fetch retention policies",
			});
		}
	})

	//  Get Pageviews
	.get("/pageviews", async ({ query, set }) => {
		const skip = Number(query.skip ?? 0);
		const take = Number(query.take ?? 50);
		const path = query.path;

		const result = await AnalyticsAdminService.getPageViews({
			skip,
			take,
			path,
		});

		if (result.success) {
			set.status = 200;
			return createApiResponse({
				success: true,
				data: result.data,
				meta: result.meta,
			});
		} else {
			set.status = 500;
			return createApiResponse({
				success: false,
				message: result.error || "Failed to fetch pageviews",
			});
		}
	})

	//  Get Events
	.get("/events", async ({ query, set }) => {
		const skip = Number(query.skip ?? 0);
		const take = Number(query.take ?? 50);
		const eventType = query.eventType;
		const path = query.path;

		const result = await AnalyticsAdminService.getEvents({
			skip,
			take,
			eventType,
			path,
		});

		if (result.success) {
			set.status = 200;
			return createApiResponse({
				success: true,
				data: result.data,
				meta: result.meta,
			});
		} else {
			set.status = 500;
			return createApiResponse({
				success: false,
				message: result.error || "Failed to fetch events",
			});
		}
	})

	//  Update a Data‑Retention Policy
	.patch(
		"/retention",
		async ({ body, set }) => {
			const result = await AnalyticsAdminService.updateDataRetention(body);

			if (result.success) {
				set.status = 200;
				return createApiResponse({
					success: true,
					message: result.message,
				});
			} else {
				set.status = 500;
				return createApiResponse({
					success: false,
					message: result.error || "Failed to update data retention policy",
				});
			}
		},
		{ body: AnalyticsAdminModel.dataRetentionSchema },
	)

	//  Fetch Aggregate Metrics
	.get("/metrics", async ({ query, set }) => {
		const { metricType, period, startTime, endTime } = query;
		const result = await AnalyticsAdminService.getAggregateMetrics({
			metricType: metricType,
			period: period,
			startTime: startTime ? new Date(startTime) : undefined,
			endTime: endTime ? new Date(endTime) : undefined,
		});

		if (result.success) {
			set.status = 200;
			return createApiResponse({
				success: true,
				data: result.data,
			});
		} else {
			set.status = 500;
			return createApiResponse({
				success: false,
				message: result.error || "Failed to fetch aggregate metrics",
			});
		}
	})

	//  Create / Update Aggregate Metrics
	.post(
		"/metrics/aggregate",
		async ({ body, set }) => {
			const result = await AnalyticsAdminService.updateAggregateMetrics(body);

			if (result.success) {
				set.status = 201;
				return createApiResponse({
					success: true,
					message: result.message,
				});
			} else {
				set.status = 500;
				return createApiResponse({
					success: false,
					message: result.error || "Failed to update aggregate metrics",
				});
			}
		},
		{ body: AnalyticsAdminModel.aggregateMetricsSchema },
	)

	// TOTAL Page Views with validated query params
	.get(
		"/pageviews/total",
		async ({ query, set, error }) => {
			const result = await AnalyticsAdminService.getTotalPageViews(query);

			if (result.success) {
				set.status = 200;
				return createApiResponse({ success: true, data: result.data });
			} else {
				return error(
					500,
					createApiResponse({
						success: false,
						message: result.error || "Failed to fetch pageviews",
					}),
				);
			}
		},
		{ query: AnalyticsAdminModel.timeRangeSchema },
	)

	// TOTAL Events with validated query params
	.get(
		"/events/total",
		async ({ query, set, error }) => {
			const result = await AnalyticsAdminService.getTotalEvents(query);

			if (result.success) {
				set.status = 200;
				return createApiResponse({ success: true, data: result.data });
			} else {
				return error(
					500,
					createApiResponse({
						success: false,
						message: result.error || "Failed to fetch events",
					}),
				);
			}
		},
		{ query: AnalyticsAdminModel.timeRangeSchema },
	);
