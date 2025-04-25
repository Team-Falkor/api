import Elysia from "elysia";
import { AnalyticsHandler } from "../../handlers/analytics";
import { requireAdminPlugin } from "../../utils/plugins";
import { prisma } from "../../utils/prisma";
import { createApiResponse } from "../../utils/response";
import {
  aggregateMetricsSchema,
  dataRetentionSchema,
  timeRangeSchema,
} from "./schema";

const analytics = new AnalyticsHandler();

export const analyticsAdminRoutes = new Elysia({ prefix: "/admin" })
  .use(requireAdminPlugin)

  //  List Data‑Retention Policies
  .get("/retention", async ({ query, set }) => {
    try {
      const skip = Number(query.skip ?? 0);
      const take = Number(query.take ?? 10);
      const policies = await analytics.listDataRetention(skip, take);
      set.status = 200;
      return createApiResponse({
        success: true,
        data: policies,
      });
    } catch (e) {
      console.error("Error fetching retention policies:", e);
      set.status = 500;
      return createApiResponse({
        success: false,
        message: "Failed to fetch retention policies",
      });
    }
  })

  //  Get Pageviews
  .get("/pageviews", async ({ query, set }) => {
    try {
      const skip = Number(query.skip ?? 0);
      const take = Number(query.take ?? 50);
      const path = query.path as string | undefined;

      const result = await analytics.getPageViews({ skip, take, path });
      set.status = 200;
      return createApiResponse({
        success: true,
        data: result.data,
        meta: {
          total: result.total,
          totalPages: result.totalPages,
          currentPage: Math.floor(skip / take) + 1,
        },
      });
    } catch (e) {
      console.error("Error fetching pageviews:", e);
      set.status = 500;
      return createApiResponse({
        success: false,
        message: "Failed to fetch pageviews",
      });
    }
  })

  //  Get Events
  .get("/events", async ({ query, set }) => {
    try {
      const skip = Number(query.skip ?? 0);
      const take = Number(query.take ?? 50);
      const eventType = query.eventType as string | undefined;
      const path = query.path as string | undefined;

      const result = await analytics.getEvents({ skip, take, eventType, path });
      set.status = 200;
      return createApiResponse({
        success: true,
        data: result.data,
        meta: {
          total: result.total,
          totalPages: result.totalPages,
          currentPage: Math.floor(skip / take) + 1,
        },
      });
    } catch (e) {
      console.error("Error fetching events:", e);
      set.status = 500;
      return createApiResponse({
        success: false,
        message: "Failed to fetch events",
      });
    }
  })

  //  Update a Data‑Retention Policy
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
        console.error("Error updating retention policy:", e);
        set.status = 500;
        return createApiResponse({
          success: false,
          message: "Failed to update data retention policy",
        });
      }
    },
    { body: dataRetentionSchema }
  )

  //  Fetch Aggregate Metrics
  .get("/metrics", async ({ query, set }) => {
    try {
      const { metricType, period, startTime, endTime } = query;
      const metrics = await analytics.getAggregateMetrics({
        metricType: metricType as string | undefined,
        period: period as string | undefined,
        startTime: startTime ? new Date(startTime as string) : undefined,
        endTime: endTime ? new Date(endTime as string) : undefined,
      });
      set.status = 200;
      return createApiResponse({
        success: true,
        data: metrics,
      });
    } catch (e) {
      console.error("Error fetching aggregate metrics:", e);
      set.status = 500;
      return createApiResponse({
        success: false,
        message: "Failed to fetch aggregate metrics",
      });
    }
  })

  //  Create / Update Aggregate Metrics
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
        console.error("Error updating aggregate metrics:", e);
        set.status = 500;
        return createApiResponse({
          success: false,
          message: "Failed to update aggregate metrics",
        });
      }
    },
    { body: aggregateMetricsSchema }
  )

  // TOTAL Page Views with validated query params
  .get(
    "/pageviews/total",
    async ({ query, set, error }) => {
      try {
        const whereClause =
          query.from || query.to
            ? {
                timestamp: {
                  ...(query.from && { gte: query.from }),
                  ...(query.to && { lte: query.to }),
                },
              }
            : {};

        const data = await prisma.pageView.count({ where: whereClause });

        set.status = 200;
        return createApiResponse({ success: true, data });
      } catch (e) {
        console.error("Error fetching pageviews:", e);
        return error(
          500,
          createApiResponse({
            success: false,
            message: "Failed to fetch pageviews",
          })
        );
      }
    },
    { query: timeRangeSchema }
  )

  // TOTAL Events with validated query params
  .get(
    "/events/total",
    async ({ query, set, error }) => {
      try {
        const whereClause =
          query.from || query.to
            ? {
                timestamp: {
                  ...(query.from && { gte: query.from }),
                  ...(query.to && { lte: query.to }),
                },
              }
            : {};

        const data = await prisma.eventLog.count({ where: whereClause });

        set.status = 200;
        return createApiResponse({ success: true, data });
      } catch (e) {
        console.error("Error fetching events:", e);
        return error(
          500,
          createApiResponse({
            success: false,
            message: "Failed to fetch events",
          })
        );
      }
    },
    { query: timeRangeSchema }
  );
