import Elysia from "elysia";
import { createApiResponse, getClientIp } from "@/utils";
import { analyticsAdminRoutes } from "./admin";
import { AnalyticsModel } from "./model";
import { AnalyticsService } from "./service";

export const analyticsRoute = new Elysia({ prefix: "/analytics" })
	.post(
		"/pageview",
		async (ctx) => {
			const { body, set } = ctx;
			const ip = getClientIp(ctx);

			const result = await AnalyticsService.recordPageView(
				body as AnalyticsModel.Pageview,
				ip,
			);

			if (result.success) {
				set.status = 201;
				return createApiResponse({
					success: true,
					message: result.message,
				});
			} else {
				set.status = 400;
				return createApiResponse({
					success: false,
					message: result.error || "Failed to record page view",
				});
			}
		},
		{
			body: AnalyticsModel.pageviewSchema,
		},
	)
	.post(
		"/event",
		async ({ body, set }) => {
			const result = await AnalyticsService.recordEvent(
				body as AnalyticsModel.Event,
			);

			if (result.success) {
				set.status = 201;
				return createApiResponse({
					success: true,
					message: result.message,
				});
			} else {
				set.status = 400;
				return createApiResponse({
					success: false,
					message: result.error || "Failed to record event",
				});
			}
		},
		{
			body: AnalyticsModel.eventSchema,
		},
	)
	.use(analyticsAdminRoutes);
