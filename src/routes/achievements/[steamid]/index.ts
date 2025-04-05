import type { IGetSchemaForGame } from "@/@types";
import type { RouterHandler } from "@/handlers/router";
import { cache } from "@/main";
import { Console } from "@/utils";

const { STEAM_API_KEY } = Bun.env;

const console = new Console({
  prefix: "[Steam Achievements] ",
});

export const GET: RouterHandler = async ({ params, query }) => {
  const { steamid: appId } = params;
  const lang = query.lang || "en";
  const cacheKey = `steamSchema:${appId}:${lang}`;

  // Cache TTL in milliseconds (24 hours)
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Return cached response if available
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return new Response(JSON.stringify(cachedData), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${STEAM_API_KEY}&appid=${appId}&l=${lang}&format=json`;

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
};
