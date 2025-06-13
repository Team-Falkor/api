import Elysia from "elysia";
import { createApiResponse } from "@/utils/response";
import { getSaveGameLocation } from "./utils";

export const saveDataRoutes = new Elysia({ prefix: "/save-data" }).get(
	"/get-path/:steamid",
	({ params, set }) => {
		const steamid = params.steamid;

		try {
			const pathData = getSaveGameLocation(steamid);

			if (!pathData) {
				set.status = 404;
				return createApiResponse({
					success: false,
					message: "No save data found",
				});
			}

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
	},
);
