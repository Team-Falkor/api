import Elysia from "elysia";
import { cachePlugin } from "../../plugins/cachePlugin";
import { createApiResponse } from "../../utils/response";
import { AchievementModel } from "./model";
import { AchievementService } from "./service";

export const steamAchievementsRoutes = new Elysia({ prefix: "/achievements" })
	.use(
		cachePlugin({
			namespace: "steam_achievements",
			maxSize: 100,
			persistence: true,
			ttl: 60 * 60 * 12, // Default TTL in seconds (12 hours)
			logLevel: "info",
		}),
	)
	.get(
		"/:steamId",
		async ({ params, cache, query, set }) => {
			const { steamId } = params;
			const lang = query.lang ?? "en";
			const cacheKey = `steamSchema:${steamId}:${lang}`;

			const CACHE_TTL_MS_SCHEMA = 24 * 60 * 60 * 1000;

			const cachedData = cache.get(cacheKey);
			if (cachedData) {
				return createApiResponse({
					success: true,
					message: "Steam game schema retrieved from cache",
					data: cachedData,
				});
			}

			try {
				const data = await AchievementService.getGameSchema(steamId, lang);
				cache.set(cacheKey, data, CACHE_TTL_MS_SCHEMA);

				return createApiResponse({
					success: true,
					message: "Steam game schema retrieved successfully",
					data,
				});
			} catch (error) {
				console.error("Error fetching Steam schema", { error });
				set.status = 404;
				return createApiResponse({
					success: false,
					message: "Steam game schema not found",
					error: { message: "Steam game schema not found" },
				});
			}
		},
		{
			params: AchievementModel.steamAchievementsGETParams,
			query: AchievementModel.languageQuery,
		},
	)

	.get(
		"/user/:steamUserId/game/:appId",
		async ({ params, query, cache, set }) => {
			const { steamUserId, appId } = params;
			const lang = query.lang ?? "en";

			const cacheKey = `playerAchievements:${steamUserId}:${appId}:${lang}`;
			const CACHE_TTL_MS_PLAYER = 1 * 60 * 60 * 1000;

			const cachedData = cache.get(cacheKey);
			if (cachedData) {
				return createApiResponse({
					success: true,
					message: "Player achievements retrieved from cache",
					data: cachedData,
				});
			}

			const result = await AchievementService.getPlayerAchievements(
				steamUserId,
				appId,
				lang,
			);

			if (result.error) {
				set.status = result.error.status;
				return createApiResponse({
					success: false,
					message: result.error.message,
					error: { message: result.error.message },
				});
			}

			if (result.data) {
				cache.set(cacheKey, result.data, CACHE_TTL_MS_PLAYER);
				return createApiResponse({
					success: true,
					message: "Player achievements retrieved successfully",
					data: result.data,
				});
			}

			set.status = 500;
			return createApiResponse({
				success: false,
				message: "Unexpected error occurred",
				error: { message: "Unexpected error occurred" },
			});
		},
		{
			params: AchievementModel.playerAchievementsParams,
			query: AchievementModel.languageQuery,
		},
	);
