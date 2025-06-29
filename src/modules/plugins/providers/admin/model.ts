import { t } from "elysia";

export namespace ProvidersAdminModel {
	// Query parameters for GET /admin/pending
	export const getPendingProvidersQuery = t.Optional(
		t.Object({
			skip: t.Optional(t.Number()),
			take: t.Optional(t.Number()),
			sortBy: t.Optional(t.Union([t.Literal("createdAt"), t.Literal("name")])),
			sortOrder: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
		}),
	);

	// Body parameters for DELETE /admin/
	export const deleteProviderBody = t.Object({
		id: t.Number(),
	});

	// Body parameters for PATCH /admin/approve
	export const approveProviderBody = t.Object({
		id: t.Number(),
	});

	// TypeScript types
	export type GetPendingProvidersQuery = typeof getPendingProvidersQuery.static;
	export type DeleteProviderBody = typeof deleteProviderBody.static;
	export type ApproveProviderBody = typeof approveProviderBody.static;

	// Admin query parameters interface
	export interface AdminQueryParams {
		skip?: number;
		take?: number;
		sortBy?: "createdAt" | "name";
		sortOrder?: "asc" | "desc";
	}

	// Provider response interfaces
	export interface ProviderAdminResponse {
		id: number;
		name: string;
		setupUrl: string;
		setupJSON: unknown;
		official: boolean;
		approved: boolean;
		createdAt: Date;
		updatedAt: Date;
		failureCount: number;
	}

	export interface DeletedProviderResponse {
		id: number;
		name: string;
		message: string;
	}

	export interface ApprovedProviderResponse {
		id: number;
		name: string;
		approved: boolean;
		updatedAt: Date;
	}
}
