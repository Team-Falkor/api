import { IGetSchemaForGame, IGetPlayerAchievementsResponse } from "@/@types";
import { cachePlugin } from "@/utils/plugins";
import { createApiResponse } from "@/utils/response";
import Elysia, { t } from "elysia";
import { steamAchievementsGETParams } from "./schema";


const STEAM_API_KEY = Bun.env.STEAM_API_KEY;

export const steamAchievementsRoutes = new Elysia({ prefix: "/achievements" })
  .use(
    cachePlugin({
      namespace: "steam_achievements",
      maxSize: 100,
      persistence: true, 
      ttl: 60 * 60 * 12, // Default TTL in seconds (12 hours)
      logLevel: "info",
    })
  )
  .get(
    "/:steamId", 
    async ({ params, cache, query }) => {
      const { steamId } = params; 
      const lang = query.lang ?? "en";
      const cacheKey = `steamSchema:${steamId}:${lang}`; 

      const CACHE_TTL_MS_SCHEMA = 24 * 60 * 60 * 1000; 

      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        return new Response(JSON.stringify(cachedData), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const apiUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${STEAM_API_KEY}&appid=${steamId}&l=${lang}&format=json`;

      try {
        const response = await fetch(apiUrl);

        if (!response.ok) {
          console.warn("Steam API Request Failed (GetSchemaForGame)", {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
          });
          return new Response("Not Found", { status: 404 });
        }

        const data: IGetSchemaForGame = await response.json();
        cache.set(cacheKey, data, CACHE_TTL_MS_SCHEMA);

        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error fetching Steam schema", { error });
        return new Response("Internal Server Error", { status: 500 });
      }
    },
    {
      params: steamAchievementsGETParams,
      query: t.Object({
        lang: t.Optional(t.String()),
      }),
    }
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
        return new Response(JSON.stringify(cachedData), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const apiUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?key=${STEAM_API_KEY}&steamid=${steamUserId}&appid=${appId}&l=${lang}&format=json`;

      try {
        const response = await fetch(apiUrl);

        if (!response.ok) {
          console.warn(
            "Steam API Request Failed (GetPlayerAchievements)",
            {
              status: response.status,
              statusText: response.statusText,
              url: response.url,
              steamUserId,
              appId,
            }
          );
          
          try {
            const errorBody = await response.json();
            set.status = response.status;
            return createApiResponse({
              success: false,
              message: `Steam API Error: ${response.statusText || "Unknown Error"}`,
              error: { message: response.statusText || "Unknown Error" },
            })
          } catch (e) {
            set.status = response.status;
            return createApiResponse({
              success: false,
              message: `Steam API Error: ${response.statusText || "Unknown Error"}`,
              error: { message: response.statusText || "Unknown Error" },
            })
          }
        }

        const data: IGetPlayerAchievementsResponse = await response.json();

        if (data.playerstats && data.playerstats.success === false) {
          let clientStatus = 400; // Bad Request by default
          const errorMessage =
            data.playerstats.error ||
            "Failed to retrieve player achievements due to an unspecified Steam error.";

          if (errorMessage.toLowerCase().includes("profile is not public")) {
            clientStatus = 403; 
          } else if (
            errorMessage.toLowerCase().includes("no stats") ||
            errorMessage.toLowerCase().includes("invalid appid")
          ) {
            clientStatus = 404; // Not Found
          }

          console.warn(
            "Steam API reported failure for GetPlayerAchievements",
            { steamUserId, appId, error: errorMessage }
          );
          createApiResponse
          set.status = clientStatus;
          return createApiResponse({
            success: false,
            message: errorMessage,
            error: { message: errorMessage },
          })
        }

        // Cache the successful response
        cache.set(cacheKey, data, CACHE_TTL_MS_PLAYER);

        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error fetching player Steam achievements", {
          error,
          steamUserId,
          appId,
        });
        set.status = 500;
        return createApiResponse({
          success: false,
          message:
            "Internal Server Error while fetching player achievements.",
          error: { message: "Internal Server Error" },
        });
      }
    },
    {
      params: t.Object({
        steamUserId: t.String({
          description: "The 64-bit Steam ID of the user.",
          examples: ["76561197960287930"],
        }),
        appId: t.String({
          description: "The Application ID of the game.",
          examples: ["440"], // Example: Team Fortress 2
        }),
      }),
      query: t.Object({
        lang: t.Optional(
          t.String({
            description:
              "Language code for achievement names/descriptions (e.g., 'en', 'de'). Default: 'en'.",
            examples: ["en", "fr", "german"],
          })
        ),
      }),
    }
  );
