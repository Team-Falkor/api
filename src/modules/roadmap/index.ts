import Elysia from "elysia";
import { prisma } from "../../utils/prisma";
import { createApiResponse } from "../../utils/response";
import { adminRoadmapRoutes } from "./admin";
// import { adminRoadmapRoutes } from "./admin";

export const roadmapRoutes = new Elysia({ prefix: "/roadmap" })
	.get("/", async () => {
		try {
			const data = await prisma.roadmapEvent.findMany({
				include: { items: true },
				orderBy: { id: "asc" },
			});
			return createApiResponse(
				{ success: true, data },
				{
					status: 200,
				},
			);
		} catch {
			return createApiResponse(
				{
					success: false,
					error: { message: "Failed to fetch roadmap events" },
				},
				{
					status: 500,
				},
			);
		}
	})
	.use(adminRoadmapRoutes);
