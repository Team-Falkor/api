import { t } from "elysia";

export namespace ProvidersModel {
	// Query parameters for GET /providers
	export const getProvidersQuery = t.Optional(
		t.Object({
			limit: t.Optional(t.Numeric({ minimum: 1, default: 10 })),
			offset: t.Optional(t.Numeric({ minimum: 0, default: 0 })),
			search: t.Optional(t.String({ default: "" })),
		}),
	);

	// Body parameters for PUT /providers
	export const createProviderBody = t.Object({
		setupUrl: t.String({ error: "setupUrl must be a valid string URL." }),
		setupJSON: t.Unknown({ error: "setupJSON must be provided." }),
	});

	// Response types
	export const providerResponse = t.Object({
		id: t.String(),
		setupUrl: t.String(),
		setupJSON: t.Unknown(),
		name: t.String(),
		official: t.Boolean(),
		createdAt: t.Date(),
		updatedAt: t.Date(),
		failureCount: t.Number(),
		approved: t.Boolean(),
	});

	export const createProviderResponse = t.Object({
		id: t.String(),
		name: t.String(),
		setupUrl: t.String(),
		official: t.Boolean(),
		approved: t.Boolean(),
	});

	// TypeScript types
	export type GetProvidersQuery = typeof getProvidersQuery.static;
	export type CreateProviderBody = typeof createProviderBody.static;
	export type ProviderResponse = typeof providerResponse.static;
	export type CreateProviderResponse = typeof createProviderResponse.static;

	// Database query parameters
	export interface GetProvidersParams {
		limit: number;
		offset: number;
		search: string;
	}

	// Cache key generation
	export const generateCacheKey = (params: GetProvidersParams): string => {
		return `providers:${params.limit}:${params.offset}:${params.search}`;
	};
}
