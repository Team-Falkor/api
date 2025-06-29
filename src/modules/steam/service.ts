import type {
	IGetOwnedGamesResponse,
	IGetPlayerAchievementsResponse,
	IGetSchemaForGame,
} from "../../@types";

const STEAM_API_KEY = Bun.env.STEAM_API_KEY;

export abstract class SteamService {
	private constructor() {}

	/**
	 * Fetch user's owned games from Steam
	 */
	static async getUserGames(
		steamUserId: string,
		includeAppInfo: boolean = true,
		includePlayedFreeGames: boolean = false,
	): Promise<{
		data?: IGetOwnedGamesResponse;
		error?: { status: number; message: string; code?: string };
	}> {
		let apiUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamUserId}&format=json`;
		if (includeAppInfo) {
			apiUrl += `&include_appinfo=1`;
		}
		if (includePlayedFreeGames) {
			apiUrl += `&include_played_free_games=1`;
		}

		try {
			const response = await fetch(apiUrl);

			if (!response.ok) {
				const errorLogDetails = {
					status: response.status,
					statusText: response.statusText,
					url: response.url,
					steamUserId,
				};
				console.warn(
					"Steam API Request Failed (GetOwnedGames)",
					errorLogDetails,
				);
				let errorResponseMessage =
					response.statusText || "Steam API request failed";
				try {
					const steamError = await response.json();
					if (steamError && typeof steamError.message === "string") {
						errorResponseMessage = steamError.message;
					}
				} catch (_e) {}
				return {
					error: {
						status: response.status,
						message: `Steam API Error: ${errorResponseMessage}`,
						code: response.status?.toString(),
					},
				};
			}

			const data: IGetOwnedGamesResponse = await response.json();

			if (!data.response || Object.keys(data.response).length === 0) {
				console.warn(
					"GetOwnedGames returned empty response (profile private, invalid SteamID, or no games)",
					{ steamUserId },
				);
				return { data: { response: {} } };
			}

			return { data };
		} catch (error) {
			console.error("Error fetching user's Steam games", {
				error: error instanceof Error ? error.message : "Unknown Error",
				steamUserId,
			});
			return {
				error: {
					status: 500,
					message: "Internal Server Error while fetching user games.",
				},
			};
		}
	}

	/**
	 * Fetch Steam game schema for achievements
	 */
	static async getGameSchema(
		steamId: string,
		lang: string = "en",
	): Promise<IGetSchemaForGame> {
		const apiUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${STEAM_API_KEY}&appid=${steamId}&l=${lang}&format=json`;

		const response = await fetch(apiUrl);

		if (!response.ok) {
			console.warn("Steam API Request Failed (GetSchemaForGame)", {
				status: response.status,
				statusText: response.statusText,
				url: response.url,
			});
			throw new Error(`Steam API Error: ${response.statusText}`);
		}

		return await response.json();
	}

	/**
	 * Fetch player achievements for a specific game
	 */
	static async getPlayerAchievements(
		steamUserId: string,
		appId: string,
		lang: string = "en",
	): Promise<{
		data?: IGetPlayerAchievementsResponse;
		error?: { status: number; message: string };
	}> {
		const apiUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?key=${STEAM_API_KEY}&steamid=${steamUserId}&appid=${appId}&l=${lang}&format=json`;

		try {
			const response = await fetch(apiUrl);

			if (!response.ok) {
				console.warn("Steam API Request Failed (GetPlayerAchievements)", {
					status: response.status,
					statusText: response.statusText,
					url: response.url,
					steamUserId,
					appId,
				});

				return {
					error: {
						status: response.status,
						message: response.statusText || "Unknown Error",
					},
				};
			}

			const data: IGetPlayerAchievementsResponse = await response.json();

			if (data.playerstats && data.playerstats.success === false) {
				let clientStatus = 400;
				const errorMessage =
					data.playerstats.error ||
					"Failed to retrieve player achievements due to an unspecified Steam error.";

				if (errorMessage.toLowerCase().includes("profile is not public")) {
					clientStatus = 403;
				} else if (
					errorMessage.toLowerCase().includes("no stats") ||
					errorMessage.toLowerCase().includes("invalid appid")
				) {
					clientStatus = 404;
				}

				console.warn("Steam API reported failure for GetPlayerAchievements", {
					steamUserId,
					appId,
					error: errorMessage,
				});

				return {
					error: {
						status: clientStatus,
						message: errorMessage,
					},
				};
			}

			return { data };
		} catch (error) {
			console.error("Error fetching player Steam achievements", {
				error,
				steamUserId,
				appId,
			});

			return {
				error: {
					status: 500,
					message: "Internal Server Error while fetching player achievements.",
				},
			};
		}
	}
}
