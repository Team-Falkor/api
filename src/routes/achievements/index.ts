import Elysia, { t } from "elysia";
import { rateLimitPlugin } from "../../utils/plugins";
import { cachePlugin } from "../../utils/plugins/cache";
import { steamAchievementsGETParams } from "./schema";
import { IGetSchemaForGame } from "./types";

const STEAM_API_KEY = Bun.env.STEAM_API_KEY;

export const steamAchievementsRoutes = new Elysia({ prefix: "/achievements" })
  .use(
    cachePlugin({
      namespace: "steam_achievements",
      maxSize: 100,
      ttl: 60 * 60 * 24,
      logLevel: "info",
    })
  )
  .use(
    rateLimitPlugin({
      max: 100,
      windowMs: 1000 * 60 * 60, // 1 hour
      message: "Too many requests",
      statusCode: 429,
    })
  )
  .get(
    "/:steamId",
    async ({ params, cache, query }) => {
      const { steamId } = params;
      const lang = query.lang ?? "en";
      const cacheKey = `steamSchema:${steamId}:${lang}`;

      const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

      // Return cached response if available
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
          console.warn("Steam API Request Failed", {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
          });
          return new Response("Not Found", { status: 404 });
        }

        const data: IGetSchemaForGame = await response.json();

        // Cache the response with a 24-hour TTL in milliseconds
        cache.set(cacheKey, data, CACHE_TTL_MS);

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
  );
