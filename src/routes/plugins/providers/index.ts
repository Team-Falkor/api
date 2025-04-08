import Elysia, { t } from "elysia";
import { ProviderHandler } from "../../../handlers/providers";
import { Console } from "../../../utils/console";
import { cachePlugin, rateLimitPlugin } from "../../../utils/plugins";
import { prisma } from "../../../utils/prisma";
import { createResponse } from "../../../utils/response";
import { providerAdminRoutes } from "./admin";

export const console = new Console();
const provider = new ProviderHandler();

export const providersRoute = new Elysia({ prefix: "/providers" })
  .use(
    rateLimitPlugin({
      max: 100,
      windowMs: 1000 * 60 * 60, // 1 hour
      message: "Too many requests",
      statusCode: 429,
    })
  )
  .use(
    cachePlugin({
      namespace: "providers",
      maxSize: 100,
      ttl: 60 * 60 * 24, // 1 day
      logLevel: "info",
    })
  )
  .get(
    "/",
    async ({ query, set, cache }) => {
      const { limit, offset, search } = query;

      // Check if the data is in the cache
      const cacheKey = `providers:${limit}:${offset}:${search}`;
      const cachedData = cache.get(cacheKey);

      // If the data is in the cache, return it
      if (cachedData) {
        set.status = 200;
        return createResponse({
          success: true,
          data: cachedData,
        });
      }

      // Get the data from the database
      const data = await prisma.provider.findMany({
        where: {
          name: {
            contains: search,
          },
          approved: true,
        },
        take: limit,
        skip: offset,
      });

      // if data is empty return 404
      if (!data) {
        set.status = 404;
        return createResponse({
          success: false,
          message: "No providers found",
        });
      }

      // Cache the data
      cache.set(cacheKey, data);

      set.status = 200;
      return createResponse({
        success: true,
        data,
      });
    },
    {
      query: t.Optional(
        t.Object({
          limit: t.Optional(t.Number()),
          offset: t.Optional(t.Number()),
          search: t.Optional(t.String()),
        })
      ),
    }
  )
  .use(providerAdminRoutes);
