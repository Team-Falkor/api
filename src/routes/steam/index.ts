import { IGetOwnedGamesResponse } from "@/@types";
import { cachePlugin } from "@/utils/plugins";
import { createApiResponse } from "@/utils/response";
import Elysia from "elysia";
import { userGamesPathParams, userGamesQueryParams } from "./schema";


const STEAM_API_KEY = Bun.env.STEAM_API_KEY;

export const steamRoutes = new Elysia({ prefix: "/steam" })
  .use(
    cachePlugin({
      namespace: "steam_api",
      maxSize: 200, 
      ttl: 60 * 60 * 1, // 1 hour
      logLevel: "info", 
    })
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
            errorLogDetails
          );
          let errorResponseMessage =
            response.statusText || "Steam API request failed";
          try {
            const steamError = await response.json();
            if (steamError && typeof steamError.message === "string") {
              errorResponseMessage = steamError.message;
            }
          } catch (e) {
            //
          }
          set.status = response.status;
          return createApiResponse({
            success: false,
            message: `Steam API Error: ${errorResponseMessage}`,
            error: {
              message: errorResponseMessage,
              code: response.status?.toString(),
            },
          });
        }

        const data: IGetOwnedGamesResponse = await response.json();

        if (!data.response || Object.keys(data.response).length === 0) {
          console.warn(
            "GetOwnedGames returned empty response (profile private, invalid SteamID, or no games)",
            { steamUserId }
          );
          cache.set(
            cacheKey,
            { response: {} },
            CACHE_TTL_MS_USER_GAMES
          );
          return createApiResponse({
            success: true,
            data: { response: {} },
          });
        }

        cache.set(cacheKey, data, CACHE_TTL_MS_USER_GAMES);
        return createApiResponse({ success: true, data });
      } catch (error: any) {
        console.error("Error fetching user's Steam games", {
          error: error.message,
          steamUserId,
        });
        set.status = 500;
        return createApiResponse({
          success: false,
          message: "Internal Server Error while fetching user games.",
          error: { message: "Internal Server Error" },
        });
      }
    },
    {
      params: userGamesPathParams,
      query: userGamesQueryParams,
    }
  );
