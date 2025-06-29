import { t } from "elysia";

export namespace AchievementModel {
	// Steam achievements GET params
	export const steamAchievementsGETParams = t.Object({
		steamId: t.String(),
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
	export type SteamAchievementsGETParams = typeof steamAchievementsGETParams.static;
	export type PlayerAchievementsParams = typeof playerAchievementsParams.static;
	export type LanguageQuery = typeof languageQuery.static;
}