import type { Provider } from "@prisma/client";
import {
	ProviderHandler,
	ProviderValidationError,
} from "../../../handlers/providers";
import { prisma } from "../../../utils/prisma";
import type { ProvidersModel } from "./model";

/**
 * Service class for handling provider-related business logic
 */
export const ProvidersService = {
	providerHandler: new ProviderHandler(),

	/**
	 * Fetch providers from database with filtering and pagination
	 */
	async getProviders(
		params: ProvidersModel.GetProvidersParams,
	): Promise<Provider[]> {
		const { limit, offset, search } = params;

		return await prisma.provider.findMany({
			where: {
				name: {
					contains: search,
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
	},

	/**
	 * Create a new provider
	 */
	async createProvider(
		setupUrl: string,
		setupJSON: unknown,
	): Promise<ProvidersModel.CreateProviderResponse> {
		const newProvider = await this.providerHandler.createProvider(
			setupUrl,
			setupJSON,
		);

		return {
			id: newProvider.id.toString(),
			name: newProvider.name,
			setupUrl: newProvider.setupUrl,
			official: newProvider.official,
			approved: newProvider.approved,
		};
	},

	/**
	 * Check if providers exist based on search criteria
	 */
	async hasProviders(
		params: ProvidersModel.GetProvidersParams,
	): Promise<boolean> {
		const providers = await this.getProviders(params);
		return providers.length > 0;
	},

	/**
	 * Log error context for provider operations
	 */
	logError(
		endpoint: string,
		requestData: Record<string, unknown>,
		error: unknown,
	): void {
		const errorContext = {
			endpoint,
			requestData: {
				...requestData,
				setupJSON:
					typeof requestData.setupJSON === "object"
						? "(JSON Object provided)"
						: typeof requestData.setupJSON,
			},
			errorType:
				error instanceof ProviderValidationError
					? "ValidationError"
					: "UnexpectedError",
			errorName: error instanceof Error ? error.name : "UnknownError",
			errorMessage: error instanceof Error ? error.message : String(error),
			timestamp: new Date().toISOString(),
		};

		console.error(
			"Provider operation failed:",
			errorContext,
			!(error instanceof ProviderValidationError) && error instanceof Error
				? `\nStack: ${error.stack}`
				: "",
		);
	},

	/**
	 * Check if error is a Prisma unique constraint violation
	 */
	isPrismaUniqueConstraintError(error: unknown): boolean {
		return (
			error instanceof Error &&
			"code" in error &&
			(error as { code: string }).code === "P2002"
		);
	},

	/**
	 * Check if error is a validation error
	 */
	isValidationError(error: unknown): boolean {
		return error instanceof ProviderValidationError;
	},
};
