import { t } from "elysia";

export namespace SteamModel {
	// User games path params
	export const userGamesPathParams = t.Object({
		steamUserId: t.String({
			description: "The 64-bit Steam ID of the user.",
			examples: ["76561197960287930"],
		}),
	});

	// User games query params
	export const userGamesQueryParams = t.Object({
		include_appinfo: t.Optional(
			t.Boolean({
				description: "Include game name and images in the response.",
				default: true,
			}),
		),
		include_played_free_games: t.Optional(
			t.Boolean({
				description: "Include free games the user has played.",
				default: false,
			}),
		),
	});

	// Steam achievements GET params
	export const steamAchievementsGETParams = t.Object({
		steamId: t.String({
			description: "The Application ID of the game.",
			examples: ["440"], // Example: Team Fortress 2
		}),
	});

	// Player achievements params
	export const playerAchievementsParams = t.Object({
		steamUserId: t.String({
			description: "The 64-bit Steam ID of the user.",
			examples: ["76561197960287930"],
		}),
		appId: t.String({
			description: "The Application ID of the game.",
			examples: ["440"], // Example: Team Fortress 2
		}),
	});

	// Query parameters
	export const languageQuery = t.Object({
		lang: t.Optional(
			t.String({
				description:
					"Language code for achievement names/descriptions (e.g., 'en', 'de'). Default: 'en'.",
				examples: ["en", "fr", "german"],
			}),
		),
	});

	// Type definitions
	export type UserGamesPathParams = typeof userGamesPathParams.static;
	export type UserGamesQueryParams = typeof userGamesQueryParams.static;
	export type SteamAchievementsGETParams = typeof steamAchievementsGETParams.static;
	export type PlayerAchievementsParams = typeof playerAchievementsParams.static;
	export type LanguageQuery = typeof languageQuery.static;
}