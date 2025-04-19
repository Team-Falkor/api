import Elysia from "elysia";
import { AnalyticsHandler } from "../../handlers/analytics";
import { rateLimitPlugin } from "../../utils/plugins/rate-limit";
import { createApiResponse } from "../../utils/response";
import { analyticsAdminRoutes } from "./admin";
import { eventSchema, pageviewSchema } from "./schema";

const analytics = new AnalyticsHandler();

export const analyticsRoute = new Elysia({ prefix: "/analytics" })
  .use(
    rateLimitPlugin({
      windowMs: 60_000, // 1 minute
      max: 100, // 100 requests per minute
      message: "Too many analytics requests, please try again later.",
      skipPaths: ["/analytics/admin/*"],
    })
  )
  .post(
    "/pageview",
    async ({ body, set }) => {
      try {
        await analytics.recordPageView(body);
        set.status = 201;
        return createApiResponse({
          success: true,
          message: "Page view recorded successfully",
        });
      } catch (e) {
        console.error(
          "Error recording page view:",
          e instanceof Error ? e.message : String(e)
        );
        set.status = 400;
        return createApiResponse({
          success: false,
          message:
            e instanceof Error ? e.message : "Failed to record page view",
        });
      }
    },
    {
      body: pageviewSchema,
    }
  )
  .post(
    "/event",
    async ({ body, set }) => {
      try {
        await analytics.recordEvent(body);
        set.status = 201;
        return createApiResponse({
          success: true,
          message: "Event recorded successfully",
        });
      } catch (e) {
        console.error(
          "Error recording event:",
          e instanceof Error ? e.message : String(e)
        );
        set.status = 400;
        return createApiResponse({
          success: false,
          message: e instanceof Error ? e.message : "Failed to record event",
        });
      }
    },
    {
      body: eventSchema,
    }
  )
  .use(analyticsAdminRoutes);
