import { ProviderHandler } from "../../../../handlers/providers";
import { prisma } from "../../../../utils/prisma";
import type { ProvidersAdminModel } from "./model";

/**
 * Service class for handling admin provider operations
 */
export abstract class ProvidersAdminService {
	private static providerHandler = new ProviderHandler();

	private constructor() {}

	/**
	 * Get pending providers awaiting approval
	 */
	static async getPendingProviders(
		params: ProvidersAdminModel.AdminQueryParams,
	): Promise<ProvidersAdminModel.ProviderAdminResponse[]> {
		return await ProvidersAdminService.providerHandler.getPendingProviders(
			params,
		);
	}

	/**
	 * Get a specific provider by ID
	 */
	static async getProvider(
		id: number,
	): Promise<ProvidersAdminModel.ProviderAdminResponse | null> {
		return await ProvidersAdminService.providerHandler.getProvider(id);
	}

	/**
	 * Delete a provider by ID
	 */
	static async deleteProvider(
		id: number,
	): Promise<ProvidersAdminModel.DeletedProviderResponse> {
		const deletedProvider =
			await ProvidersAdminService.providerHandler.deleteProvider(id);
		return {
			...deletedProvider,
			message: `Provider ${deletedProvider.name} successfully deleted`,
		};
	}

	/**
	 * Approve a provider by ID
	 */
	static async approveProvider(
		id: number,
	): Promise<ProvidersAdminModel.ApprovedProviderResponse> {
		return await ProvidersAdminService.providerHandler.approveProvider(id);
	}

	/**
	 * Get total count of all providers
	 */
	static async getTotalProvidersCount(): Promise<number> {
		return await prisma.provider.count();
	}

	/**
	 * Check if a provider exists
	 */
	static async providerExists(id: number): Promise<boolean> {
		const provider = await ProvidersAdminService.getProvider(id);
		return provider !== null;
	}

	/**
	 * Log admin operation errors
	 */
	static logAdminError(
		operation: string,
		providerId: number | undefined,
		error: unknown,
	): void {
		const errorContext = {
			operation,
			providerId,
			errorName: error instanceof Error ? error.name : "UnknownError",
			errorMessage: error instanceof Error ? error.message : String(error),
			timestamp: new Date().toISOString(),
		};

		console.error(
			`Admin provider operation failed: ${operation}`,
			errorContext,
			error instanceof Error ? `\nStack: ${error.stack}` : "",
		);
	}

	/**
	 * Check if error indicates provider not found
	 */
	static isProviderNotFoundError(error: unknown): boolean {
		return error instanceof Error && error.message.includes("not found");
	}
}
