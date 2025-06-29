import Elysia from "elysia";
import { cachePlugin } from "../../../plugins/cachePlugin";
import { createApiResponse } from "../../../utils/response";
import { providerAdminRoutes } from "./admin";
import { ProvidersModel } from "./model";
import { ProvidersService } from "./service";

export const providersRoute = new Elysia({ prefix: "/providers" })
	.use(
		cachePlugin({
			persistence: true,
			namespace: "providers",
			maxSize: 100,
			ttl: 60 * 60 * 24,
			logLevel: "info",
		}),
	)
	.get(
		"/",
		async ({ query, set, cache }) => {
			const { limit = 10, offset = 0, search = "" } = query;
			const params = { limit, offset, search };

			const cacheKey = ProvidersModel.generateCacheKey(params);
			const cachedData = cache.get(cacheKey);

			if (cachedData) {
				console.info(`Cache hit for ${cacheKey}`);
				set.status = 200;
				return createApiResponse({
					success: true,
					data: cachedData,
				});
			}

			console.info(`Cache miss for ${cacheKey}`);

			try {
				const data = await ProvidersService.getProviders(params);

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
			query: ProvidersModel.getProvidersQuery,
		},
	)
	.put(
		"/",
		async ({ body, set }) => {
			const { setupUrl, setupJSON } = body;

			try {
				const newProvider = await ProvidersService.createProvider(
					setupUrl,
					setupJSON,
				);

				set.status = 201;
				return createApiResponse({
					success: true,
					message: "Provider submitted successfully. It needs approval.",
					data: newProvider,
				});
			} catch (e) {
				ProvidersService.logError("PUT /providers", { setupUrl, setupJSON }, e);

				if (ProvidersService.isValidationError(e)) {
					set.status = 400;
					return createApiResponse({
						success: false,
						message: (e as Error).message,
						error: {
							message: (e as Error).message,
							code: "VALIDATION_ERROR",
						},
					});
				}

				if (ProvidersService.isPrismaUniqueConstraintError(e)) {
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
			body: ProvidersModel.createProviderBody,
		},
	)
	.use(providerAdminRoutes);
