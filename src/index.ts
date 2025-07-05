import { cors } from "@elysiajs/cors";
import { type Context, Elysia } from "elysia";
import { startProviderCheckScheduler } from "./helpers/plugins/providers/check-providers-interval";
import { auth } from "./lib/auth";
import { steamAchievementsRoutes } from "./modules/achievement";
import { analyticsRoute } from "./modules/analytics";
import { providersRoute } from "./modules/plugins/providers";
import { roadmapRoutes } from "./modules/roadmap";
import { saveDataRoutes } from "./modules/save-data";
import { steamRoutes } from "./modules/steam";
import { rateLimitPlugin } from "./plugins/rate-limit";
import { Console } from "./utils/console";

const version = require("../package.json").version;

const betterAuthView = (context: Context) => {
	const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"];
	// validate request method
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	} else {
		context.set.status = 405;
	}
};

export const app = new Elysia()
	.use(
		rateLimitPlugin({
			windowMs: 60_000, // 1 minute
			max: 15,
			headers: true,
			verbose: true,
			skipPaths: ["/health/?", "/favicon.ico", "/admin/*", "*/admin/*"],
			tiers: [
				{
					path: "*/analytics/**",
					max: 50,
					method: "ALL",
					windowMs: 60_000,
				},
			],
		}),
	)
	.use(cors())
	.all("/auth/*", betterAuthView)
	.get("/health", () => ({ status: "ok" }))
	.get("/", () => ({
		message: `Hello from 🐲 Falkor API ${version}`,
		links: {
			github: `https://github.com/team-falkor/api`,
			docs: `https://docs.falkor.app`,
			app: `https://falkor.moe/download`,
		},
	}))
	.use(steamRoutes)
	.use(steamAchievementsRoutes)
	.use(providersRoute)
	.use(analyticsRoute)
	.use(roadmapRoutes)
	.use(saveDataRoutes)
	.listen(3000, (srv) => {
		Console.withTimestamp().success(
			`🐲 falkor api is running at ${srv.hostname}:${srv.port}`,
		);

		startProviderCheckScheduler();
	});
