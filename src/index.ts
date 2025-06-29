import { cors } from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";
import { type Context, Elysia } from "elysia";
import { startProviderCheckScheduler } from "./helpers/plugins/providers/check-providers-interval";
import { auth } from "./lib/auth";
import { steamAchievementsRoutes } from "./modules/achievement";
import { analyticsRoute } from "./modules/analytics";
import { providersRoute } from "./modules/plugins/providers";
import { roadmapRoutes } from "./modules/roadmap";
import { steamRoutes } from "./modules/steam";
import { Console } from "./utils/console";

const betterAuthView = (context: Context) => {
	const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"];
	// validate request method
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	} else {
		context.error(405);
	}
};

export const app = new Elysia()
	.use(cors())
	.use(
		swagger({
			path: "/docs",
			documentation: {
				info: {
					title: "Falkor API",
					version: "2.0.0",
					description:
						"The Falkor API is a RESTful API that provides access to the Falkor platform.",
				},
			},
		}),
	)
	.all("/auth/*", betterAuthView)
	.get("/", () => ({ message: "Hello from falkor" }))
	.use(steamRoutes)
	.use(steamAchievementsRoutes)
	.use(providersRoute)
	.use(analyticsRoute)
	.use(roadmapRoutes)
	.listen(3000, (srv) => {
		Console.withTimestamp().success(
			`🐲 falkor api is running at ${srv.hostname}:${srv.port}`,
		);

		startProviderCheckScheduler();
	});
