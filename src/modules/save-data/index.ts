import Elysia from "elysia";
import { getSaveGameLocation } from "@/helpers/save-data";
import { cachePlugin } from "@/plugins/cachePlugin";
import { createApiResponse } from "@/utils/response";

export const saveDataRoutes = new Elysia({ prefix: "/save-data" })
	.use(
		cachePlugin({
			namespace: "save_data",
			maxSize: 200,
			ttl: 60 * 60 * 1, // 1 hour
			logLevel: "info",
		}),
	)
	.get("/get-path/:steamid", async ({ params, set, cache }) => {
		const steamid = params.steamid;
		const cacheKey = `saveData:${steamid}`;

		try {
			const cachedData = await cache.get(cacheKey);

			if (cachedData) {
				set.status = 200;
				return createApiResponse({
					success: true,
					message: "Save data found",
					data: cachedData,
				});
			}

			const pathData = await getSaveGameLocation(steamid);

			if (!pathData) {
				set.status = 404;
				return createApiResponse({
					success: false,
					message: "No save data found",
				});
			}

			await cache.set(cacheKey, pathData);

			set.status = 200;
			return createApiResponse({
				success: true,
				message: "Save data found",
				data: pathData,
			});
		} catch (error) {
			set.status = 500;
			return createApiResponse({
				success: false,
				message:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	});
