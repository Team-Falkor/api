import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { steamAchievementsRoutes } from "./routes/achievements";
import { analyticsRoute } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { providersRoute } from "./routes/plugins/providers";
import { startProviderCheckScheduler } from "./utils/helpers/plugins/providers/check-providers-interval";
import { rateLimitPlugin } from "./utils/plugins";

export const app = new Elysia()
  .use(
    rateLimitPlugin({
      windowMs: 60_000,
      max: 15,
      headers: true,
      verbose: true,
      skipPaths: [
        "/health/?",
        "/favicon.ico",
        "/auth/*",
        "/admin/*",
        "*/admin/*",
      ],
    })
  )
  .use(cors())
  .get("/", () => ({ message: "Hello from falkor" }))
  .use(authRoutes)
  .use(steamAchievementsRoutes)
  .use(providersRoute)
  .use(analyticsRoute)

  .listen(3000, (srv) => {
    console.info(`🐲 falkor api is running at ${srv.hostname}:${srv.port}`);
    startProviderCheckScheduler();
  });
