import type { Provider } from "@prisma/client";
import type { PluginSetupJSON } from "@team-falkor/shared-types";
import { prisma } from "../utils/prisma";

/**
 * Error class for provider validation errors
 */
export class ProviderValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProviderValidationError";
	}
}

/**
 * Handler for provider-related operations
 */
export class ProviderHandler {
	private db = prisma;

	/**
	 * Validates a provider setup JSON
	 * @param setupJson - The setup JSON to validate
	 * @returns The validated PluginSetupJSON
	 * @throws ProviderValidationError if validation fails
	 */
	validate(setupJson: unknown): PluginSetupJSON {
		try {
			// Basic type check
			if (typeof setupJson !== "object" || setupJson === null) {
				throw new ProviderValidationError("Invalid setup JSON: not an object");
			}

			const json = setupJson as Record<string, unknown>;

			// Validate required fields
			this.validateRequiredFields(json);

			// Validate ID format
			this.validateId(json.id);

			// Validate version
			this.validateVersion(json.version);

			// Validate config
			this.validateConfig(json.config);

			// Validate basic fields
			this.validateBasicFields(json);

			// Validate optional fields
			this.validateOptionalFields(json);

			// Validate author if present
			if ("author" in json && json.author !== undefined) {
				this.validateAuthor(json.author);
			}

			// If all validations pass, we can safely cast and return the value
			return setupJson as PluginSetupJSON;
		} catch (error) {
			if (error instanceof ProviderValidationError) {
				throw error;
			}
			throw new ProviderValidationError(
				`Validation failed: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Validates that all required fields are present
	 */
	private validateRequiredFields(json: Record<string, unknown>): void {
		const requiredFields: Array<keyof PluginSetupJSON> = [
			"id",
			"version",
			"config",
			"multiple_choice",
			"name",
			"description",
			"logo",
		];

		for (const field of requiredFields) {
			if (!(field in json)) {
				throw new ProviderValidationError(
					`Invalid setup JSON: missing required field '${field}'`,
				);
			}
		}
	}

	/**
	 * Validates the ID format
	 */
	private validateId(id: unknown): void {
		if (typeof id !== "string") {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'id' must be a string",
			);
		}

		const idParts = id.split(".");
		if (idParts.length !== 2 && idParts.length !== 3) {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'id' must be in the format 'a.b' or 'a.b.c'",
			);
		}
	}

	/**
	 * Validates the version format
	 */
	private validateVersion(version: unknown): void {
		if (typeof version !== "string") {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'version' must be a string",
			);
		}
	}

	/**
	 * Validates the config object
	 */
	private validateConfig(config: unknown): void {
		if (config !== false && (typeof config !== "object" || config === null)) {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'config' must be false or an object",
			);
		}

		if (config && typeof config === "object") {
			const configObj = config as Record<string, unknown>;
			if ("search" in configObj) {
				if (
					!Array.isArray(configObj.search) ||
					!configObj.search.every((item) => typeof item === "string")
				) {
					throw new ProviderValidationError(
						"Invalid setup JSON: 'config.search' must be an array of strings",
					);
				}
			}
		}
	}

	/**
	 * Validates basic required fields
	 */
	private validateBasicFields(json: Record<string, unknown>): void {
		if (typeof json.multiple_choice !== "boolean") {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'multiple_choice' must be a boolean",
			);
		}

		if (typeof json.name !== "string") {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'name' must be a string",
			);
		}

		if (typeof json.description !== "string") {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'description' must be a string",
			);
		}

		if (typeof json.logo !== "string") {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'logo' must be a string",
			);
		}
	}

	/**
	 * Validates optional fields
	 */
	private validateOptionalFields(json: Record<string, unknown>): void {
		// Optional fields: banner, api_url, setup_path
		if (
			"banner" in json &&
			json.banner !== undefined &&
			typeof json.banner !== "string"
		) {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'banner' must be a string",
			);
		}

		if (
			"api_url" in json &&
			json.api_url !== undefined &&
			typeof json.api_url !== "string"
		) {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'api_url' must be a string",
			);
		}

		if (
			"setup_path" in json &&
			json.setup_path !== undefined &&
			typeof json.setup_path !== "string"
		) {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'setup_path' must be a string",
			);
		}
	}

	/**
	 * Validates the author object
	 */
	private validateAuthor(author: unknown): void {
		if (typeof author !== "object" || author === null) {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'author' must be an object",
			);
		}

		const authorObj = author as Record<string, unknown>;
		if (
			"name" in authorObj &&
			authorObj.name !== undefined &&
			typeof authorObj.name !== "string"
		) {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'author.name' must be a string",
			);
		}

		if (
			"url" in authorObj &&
			authorObj.url !== undefined &&
			typeof authorObj.url !== "string"
		) {
			throw new ProviderValidationError(
				"Invalid setup JSON: 'author.url' must be a string",
			);
		}
	}

	/**
	 * Creates a new provider
	 * @param setupUrl - The URL to the setup JSON
	 * @param setupJSON - The validated setup JSON
	 * @param official - Whether this is an official provider
	 * @returns The created provider
	 */
	async createProvider(
		setupUrl: string,
		setupJSON: unknown,
		official: boolean = false,
	): Promise<Provider> {
		// Validate the setup JSON
		const validatedSetup = this.validate(setupJSON);

		return this.db.provider.create({
			data: {
				setupUrl,
				setupJSON: JSON.stringify(validatedSetup),
				name: validatedSetup.name,
				official,
			},
		});
	}

	/**
	 * Updates an existing provider
	 * @param id - The provider ID
	 * @param data - The data to update
	 * @returns The updated provider
	 */
	async updateProvider(
		id: number,
		data: {
			setupUrl?: string;
			setupJSON?: unknown;
			name?: string;
			official?: boolean;
			approved?: boolean;
		},
	): Promise<Provider> {
		const validatedJson = this.validate(data.setupJSON);

		return this.db.provider.update({
			where: { id },
			data: {
				...data,
				setupJSON: JSON.stringify(validatedJson),
				name: data.name ?? (validatedJson ? validatedJson.name : undefined),
			},
		});
	}

	/**
	 * Gets a provider by ID
	 * @param id - The provider ID
	 * @returns The provider or null if not found
	 */
	async getProvider(id: number): Promise<Provider | null> {
		return this.db.provider.findUnique({
			where: { id },
		});
	}

	/**
	 * Gets all providers
	 * @param options - Query options
	 * @returns Array of providers
	 */
	async getProviders(options?: {
		official?: boolean;
		skip?: number;
		take?: number;
	}): Promise<Provider[]> {
		return this.db.provider.findMany({
			where:
				options?.official !== undefined
					? { official: options.official }
					: undefined,
			skip: options?.skip,
			take: options?.take,
			orderBy: { createdAt: "desc" },
		});
	}

	/**
	 * Deletes a provider
	 * @param id - The provider ID
	 * @returns The deleted provider
	 */
	async deleteProvider(id: number): Promise<Provider> {
		return this.db.provider.delete({
			where: { id },
		});
	}

	/**
	 * Approves a provider
	 * @param id - The provider ID
	 * @returns The approved provider
	 * @throws Error if provider not found
	 */
	async approveProvider(id: number): Promise<Provider> {
		// Check if provider exists
		const provider = await this.getProvider(id);
		if (!provider) {
			throw new Error(`Provider with ID ${id} not found`);
		}

		// Update the provider's approved status
		return this.db.provider.update({
			where: { id },
			data: { approved: true },
		});
	}

	/**
	 * Gets providers awaiting review (not approved)
	 * @param options - Optional parameters for pagination and sorting
	 * @returns Array of providers awaiting review
	 */
	async getPendingProviders(options?: {
		skip?: number;
		take?: number;
		sortBy?: "createdAt" | "name";
		sortOrder?: "asc" | "desc";
	}): Promise<Provider[]> {
		return this.db.provider.findMany({
			where: { approved: false },
			skip: options?.skip,
			take: options?.take,
			orderBy: options?.sortBy
				? { [options.sortBy]: options?.sortOrder || "desc" }
				: { createdAt: "desc" },
		});
	}
}
