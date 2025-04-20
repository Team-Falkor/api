import Elysia from "elysia";
import { prisma } from "../../utils/prisma";
import { createApiResponse } from "../../utils/response";
import { adminRoadmapRoutes } from "./admin";

export const roadmapRoutes = new Elysia({ prefix: "/roadmap" })
  .get("/", async ({ set, error }) => {
    try {
      const data = await prisma.roadmapEvent.findMany({
        include: { items: true },
        orderBy: { id: "asc" },
      });
      set.status = 200;
      return createApiResponse({ success: true, data });
    } catch (err) {
      return error(
        500,
        createApiResponse({
          success: false,
          error: { message: "Failed to fetch roadmap events" },
        })
      );
    }
  })
  .use(adminRoadmapRoutes);
