// src/routes/admin/analytics.ts

import Elysia from "elysia";
import { AnalyticsHandler } from "../../handlers/analytics";
import { requireAdminPlugin } from "../../utils/plugins";
import { createApiResponse } from "../../utils/response";
import { dataRetentionSchema, aggregateMetricsSchema } from "./schema";

const analytics = new AnalyticsHandler();

export const analyticsAdminRoutes = new Elysia({ prefix: "/admin" })
  .use(requireAdminPlugin)
  .patch(
    "/retention",
    async ({ body, set }) => {
      try {
        await analytics.manageDataRetention(body.dataType, body.retentionDays);
        set.status = 200;
        return createApiResponse({
          success: true,
          message: `Data retention policy updated for ${body.dataType}`,
        });
      } catch (e) {
        console.error(
          "Error updating retention policy:",
          e instanceof Error ? e.message : String(e)
        );
        set.status = 500;
        return createApiResponse({
          success: false,
          message: "Failed to update data retention policy",
        });
      }
    },
    {
      body: dataRetentionSchema,
    }
  )
  .post(
    "/metrics/aggregate",
    async ({ body, set }) => {
      try {
        await analytics.updateAggregateMetrics(body);
        set.status = 201;
        return createApiResponse({
          success: true,
          message: "Aggregate metrics updated successfully",
        });
      } catch (e) {
        console.error(
          "Error updating aggregate metrics:",
          e instanceof Error ? e.message : String(e)
        );
        set.status = 500;
        return createApiResponse({
          success: false,
          message: "Failed to update aggregate metrics",
        });
      }
    },
    {
      body: aggregateMetricsSchema,
    }
  );
