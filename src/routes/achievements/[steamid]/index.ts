import type { IGetSchemaForGame } from "@/@types";
import type { RouterContext, RouterHandler } from "@/handlers/router";
import { cache } from "@/main";

const { STEAM_API_KEY } = Bun.env;

export const GET: RouterHandler = async (context) => {
  const { steamid: id } = context.params;
  const { lang } = context.query;

  try {
    const cached = cache.get(`steamSchema:${id}:${lang ?? "en"}`);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const response = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${STEAM_API_KEY}&appid=${id}&l=${lang}&format=json`
    );

    if (!response.ok) {
      console.log({
        status: response.status,
        statusText: response.statusText,
        url: response.url,
      });
      return new Response("Not Found", { status: 404 });
    }

    const data: IGetSchemaForGame = await response.json();

    cache.set(`steamSchema:${id}:${lang ?? "en"}`, data, 60 * 60 * 24);
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.log({ error });
    return new Response("Not Found", { status: 404 });
  }
};

export default (context: RouterContext) => {
  console.log(context);
};
