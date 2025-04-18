import Elysia, { t } from "elysia";
import {
  ProviderHandler,
  ProviderValidationError,
} from "../../../handlers/providers";
import { Console } from "../../../utils/console";
import { cachePlugin } from "../../../utils/plugins";
import { prisma } from "../../../utils/prisma";
import { createResponse } from "../../../utils/response";
import { providerAdminRoutes } from "./admin";

export const console = new Console();
const provider = new ProviderHandler();

export const providersRoute = new Elysia({ prefix: "/providers" })

  .use(
    cachePlugin({
      persistence: true,
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
        omit: {
          failureCount: true,
        },
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
  .put(
    "/",
    async ({ body, set, error }) => {
      const { setupUrl, setupJSON } = body;

      try {
        const created = await provider.createProvider(setupUrl, setupJSON);

        return created;
      } catch (e) {
        // Enhanced error logging with context and structured information
        const errorContext = {
          endpoint: "PUT /providers",
          requestData: {
            setupUrl,
            setupJSON:
              typeof setupJSON === "object"
                ? "(JSON Object)"
                : typeof setupJSON,
          },
          errorType:
            e instanceof ProviderValidationError
              ? "ValidationError"
              : "UnexpectedError",
          errorName: e instanceof Error ? e.name : "Unknown",
          timestamp: new Date().toISOString(),
        };

        console.error(
          "Provider creation failed:",
          errorContext,
          "\nError details:",
          e instanceof Error ? { message: e.message, stack: e.stack } : e
        );

        // Return appropriate error response based on error type
        if (e instanceof ProviderValidationError) {
          return error(
            400,
            createResponse({
              success: false,
              message: `Validation error: ${e.message}`,
            })
          );
        }

        return error(
          500,
          createResponse({
            success: false,
            message: "Internal Server Error",
          })
        );
      }
    },
    {
      body: t.Object({
        setupUrl: t.String(),
        setupJSON: t.Unknown(),
      }),
    }
  )
  .use(providerAdminRoutes);
