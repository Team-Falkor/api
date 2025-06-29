import { Elysia } from "elysia";
import { requireAdminRoute } from "../../../../plugins/requireAdminRoute";
import { createApiResponse } from "../../../../utils/response";
import { ProvidersAdminModel } from "./model";
import { ProvidersAdminService } from "./service";

export const providerAdminRoutes = new Elysia({ prefix: "/admin" })
	.use(requireAdminRoute)
	.get(
		"/pending",
		async ({ query, set, error }) => {
			try {
				const params = {
					skip: query?.skip,
					take: query?.take,
					sortBy: query?.sortBy,
					sortOrder: query?.sortOrder,
				};

				// Get providers awaiting review
				const pendingProviders =
					await ProvidersAdminService.getPendingProviders(params);

				set.status = 200;
				return createApiResponse({
					success: true,
					message: "Pending providers retrieved successfully",
					data: pendingProviders,
				});
			} catch (e) {
				ProvidersAdminService.logAdminError(
					"getPendingProviders",
					undefined,
					e,
				);
				return error(
					500,
					createApiResponse({
						success: false,
						message: "Failed to retrieve pending providers",
						error: true,
					}),
				);
			}
		},
		{
			query: ProvidersAdminModel.getPendingProvidersQuery,
		},
	)
	.delete(
		"/",
		async ({ body, set, error }) => {
			const { id } = body;

			try {
				// Check if provider exists
				const providerExists = await ProvidersAdminService.providerExists(id);
				if (!providerExists) {
					return error(
						404,
						createApiResponse({
							success: false,
							message: `Provider with ID ${id} not found`,
							error: true,
						}),
					);
				}

				// Delete the provider
				const deletedProvider = await ProvidersAdminService.deleteProvider(id);

				set.status = 200;
				return createApiResponse({
					success: true,
					message: "Provider deleted successfully",
					data: deletedProvider,
				});
			} catch (e) {
				ProvidersAdminService.logAdminError("deleteProvider", id, e);
				return error(
					500,
					createApiResponse({
						success: false,
						message: "Failed to delete provider",
						error: true,
					}),
				);
			}
		},
		{
			body: ProvidersAdminModel.deleteProviderBody,
		},
	)
	.patch(
		"/approve",
		async ({ body, set, error }) => {
			const { id } = body;

			try {
				// Approve the provider
				const approvedProvider =
					await ProvidersAdminService.approveProvider(id);

				set.status = 200;
				return createApiResponse({
					success: true,
					message: "Provider approved successfully",
					data: approvedProvider,
				});
			} catch (e) {
				// Check if provider not found
				if (ProvidersAdminService.isProviderNotFoundError(e)) {
					return error(
						404,
						createApiResponse({
							success: false,
							message: e instanceof Error ? e.message : "Provider not found",
							error: true,
						}),
					);
				}

				ProvidersAdminService.logAdminError("approveProvider", id, e);
				return error(
					500,
					createApiResponse({
						success: false,
						message: "Failed to approve provider",
						error: true,
					}),
				);
			}
		},
		{
			body: ProvidersAdminModel.approveProviderBody,
		},
	)

	// Total Providers
	.get("/total", async ({ set, error }) => {
		try {
			// Get total providers
			const totalProviders =
				await ProvidersAdminService.getTotalProvidersCount();

			set.status = 200;
			return createApiResponse({
				success: true,
				message: "Total providers retrieved successfully",
				data: totalProviders,
			});
		} catch (e) {
			ProvidersAdminService.logAdminError(
				"getTotalProvidersCount",
				undefined,
				e,
			);
			return error(
				500,
				createApiResponse({
					success: false,
					message: "Failed to retrieve total providers",
					error: true,
				}),
			);
		}
	});
