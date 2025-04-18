import { cors } from "@elysiajs/cors";
import { Server } from "bun";
import { Elysia } from "elysia";
import { steamAchievementsRoutes } from "./routes/achievements";
import { authRoutes } from "./routes/auth";
import { providersRoute } from "./routes/plugins/providers";
import { startProviderCheckScheduler } from "./utils/helpers/plugins/providers/check-providers-interval";

export let server: Server | null;

export const app = new Elysia()
  .use(cors())

  .get("/", () => ({ message: "Hello from falkor" }))
  .use(authRoutes)
  .use(steamAchievementsRoutes)
  .use(providersRoute)
  .listen(3000, (server) => {
    startProviderCheckScheduler();
    console.info(
      `🐲 falkor api is running at ${server?.hostname}:${server?.port}`
    );
    server = server;
  });
