import Elysia from "elysia";
import type { IGetOwnedGamesResponse } from "../../@types";
import { cachePlugin } from "../../plugins/cachePlugin";
import { createApiResponse } from "../../utils/response";
import { SteamModel } from "./model";
import { SteamService } from "./service";

export const steamRoutes = new Elysia({ prefix: "/steam" })
	.use(
		cachePlugin({
			namespace: "steam_api",
			maxSize: 200,
			ttl: 60 * 60 * 1, // 1 hour
			logLevel: "info",
		}),
	)
	.get(
		"/user/:steamUserId/games",
		async ({ params, query, cache, set }) => {
			const { steamUserId } = params;
			const includeAppInfo = query.include_appinfo ?? true;
			const includePlayedFreeGames = query.include_played_free_games ?? false;

			const cacheKey = `userGames:${steamUserId}:appinfo-${includeAppInfo}:free-${includePlayedFreeGames}`;
			const CACHE_TTL_MS_USER_GAMES = 6 * 60 * 60 * 1000;

			const cachedData = cache.get(cacheKey);
			if (cachedData) {
				return createApiResponse({
					success: true,
					data: cachedData as IGetOwnedGamesResponse,
				});
			}

			const result = await SteamService.getUserGames(
				steamUserId,
				includeAppInfo,
				includePlayedFreeGames,
			);

			if (result.error) {
				set.status = result.error.status;
				return createApiResponse({
					success: false,
					message: result.error.message,
					error: {
						message: result.error.message,
						code: result.error.code,
					},
				});
			}

			if (result.data) {
				// Handle empty response case
				if (
					!result.data.response ||
					Object.keys(result.data.response).length === 0
				) {
					cache.set(cacheKey, { response: {} }, CACHE_TTL_MS_USER_GAMES);
					return createApiResponse({
						success: true,
						data: { response: {} },
					});
				}

				cache.set(cacheKey, result.data, CACHE_TTL_MS_USER_GAMES);
				return createApiResponse({ success: true, data: result.data });
			}

			set.status = 500;
			return createApiResponse({
				success: false,
				message: "Unexpected error occurred",
				error: { message: "Unexpected error occurred" },
			});
		},
		{
			params: SteamModel.userGamesPathParams,
			query: SteamModel.userGamesQueryParams,
		},
	);
