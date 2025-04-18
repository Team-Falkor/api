import { Provider } from "@prisma/client";
import Elysia, { t } from "elysia";
import {
  ProviderHandler,
  ProviderValidationError,
} from "../../../handlers/providers";
import { Console } from "../../../utils/console";
import { cachePlugin } from "../../../utils/plugins";
import { prisma } from "../../../utils/prisma";
import { createApiResponse } from "../../../utils/response";
import { providerAdminRoutes } from "./admin";

export const console = new Console();
const provider = new ProviderHandler();

export const providersRoute = new Elysia({ prefix: "/providers" })
  .use(
    cachePlugin({
      persistence: true,
      namespace: "providers",
      maxSize: 100,
      ttl: 60 * 60 * 24,
      logLevel: "info",
    })
  )
  .get(
    "/",
    async ({ query, set, cache }) => {
      const { limit = 10, offset = 0, search = "" } = query;

      const cacheKey = `providers:${limit}:${offset}:${search}`;
      const cachedData = cache.get(cacheKey);

      if (cachedData) {
        console.info(`Cache hit for ${cacheKey}`);
        set.status = 200;
        return createApiResponse({
          success: true,
          data: cachedData as Provider[],
        });
      }

      console.info(`Cache miss for ${cacheKey}`);

      try {
        const data = await prisma.provider.findMany({
          where: {
            name: {
              contains: search, // Assuming case-sensitive search by default in SQLite
            },
            approved: true,
          },
          take: limit,
          skip: offset,
          select: {
            id: true,
            setupUrl: true,
            setupJSON: true,
            name: true,
            official: true,
            createdAt: true,
            updatedAt: true,
            failureCount: true,
            approved: true,
          },
          orderBy: {
            name: "asc",
          },
        });

        if (data.length === 0) {
          set.status = 404;
          return createApiResponse({
            success: false,
            message: "No approved providers found matching the criteria.",
          });
        }

        cache.set(cacheKey, data);

        set.status = 200;
        return createApiResponse({
          success: true,
          data,
        });
      } catch (dbError) {
        console.error("Database error fetching providers:", dbError);
        set.status = 500;
        return createApiResponse({
          success: false,
          message: "Failed to fetch providers due to a server error.",
        });
      }
    },
    {
      query: t.Optional(
        t.Object({
          limit: t.Optional(t.Numeric({ minimum: 1, default: 10 })),
          offset: t.Optional(t.Numeric({ minimum: 0, default: 0 })),
          search: t.Optional(t.String({ default: "" })),
        })
      ),
    }
  )
  .put(
    "/",
    async ({ body, set }) => {
      const { setupUrl, setupJSON } = body;

      try {
        const newProvider = await provider.createProvider(setupUrl, setupJSON);

        set.status = 201;
        return createApiResponse({
          success: true,
          message: "Provider submitted successfully. It needs approval.",
          data: {
            id: newProvider.id,
            name: newProvider.name,
            setupUrl: newProvider.setupUrl,
            official: newProvider.official,
            approved: newProvider.approved,
          },
        });
      } catch (e) {
        const errorContext = {
          endpoint: "PUT /providers",
          requestData: {
            setupUrl,
            setupJSON:
              typeof setupJSON === "object"
                ? "(JSON Object provided)"
                : typeof setupJSON,
          },
          errorType:
            e instanceof ProviderValidationError
              ? "ValidationError"
              : "UnexpectedError",
          errorName: e instanceof Error ? e.name : "UnknownError",
          errorMessage: e instanceof Error ? e.message : String(e),
          timestamp: new Date().toISOString(),
        };

        console.error(
          "Provider creation failed:",
          errorContext,
          !(e instanceof ProviderValidationError) && e instanceof Error
            ? `\nStack: ${e.stack}`
            : ""
        );

        if (e instanceof ProviderValidationError) {
          set.status = 400;
          return createApiResponse({
            success: false,
            message: e.message,
            error: {
              message: e.message,
              code: "VALIDATION_ERROR",
            },
          });
        }

        if (e instanceof Error && "code" in e && (e as any).code === "P2002") {
          set.status = 409;
          return createApiResponse({
            success: false,
            message:
              "A provider with similar unique details (e.g., setupUrl or name) might already exist.",
            error: {
              message: "Duplicate provider.",
              code: "CONFLICT_ERROR",
            },
          });
        }

        set.status = 500;
        return createApiResponse({
          success: false,
          message:
            "An unexpected internal server error occurred while adding the provider.",
          error: {
            message: "Internal error",
            code: "INTERNAL_SERVER_ERROR",
          },
        });
      }
    },
    {
      body: t.Object({
        setupUrl: t.String({ error: "setupUrl must be a valid string URL." }),
        setupJSON: t.Unknown({ error: "setupJSON must be provided." }),
      }),
    }
  )
  .use(providerAdminRoutes);
