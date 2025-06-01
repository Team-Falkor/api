import { t } from "elysia";

export const userGamesPathParams = t.Object({
  steamUserId: t.String({
    description: "The 64-bit Steam ID of the user.",
    examples: ["76561197960287930"],
  }),
});

export const userGamesQueryParams = t.Object({
  include_appinfo: t.Optional(
    t.Boolean({
      description: "Include game name and images in the response.",
      default: true,
    })
  ),
  include_played_free_games: t.Optional(
    t.Boolean({
      description: "Include free games the user has played.",
      default: false,
    })
  ),
});
