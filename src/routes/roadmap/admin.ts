import Elysia, { t } from "elysia";
import { requireAdminPlugin } from "../../utils/plugins";
import { prisma } from "../../utils/prisma";
import { createApiResponse } from "../../utils/response";
import {
  CreateRoadmapSchema,
  PhaseSchema,
  RoadmapItemSchema,
  StatusSchema,
} from "./schema";

export const adminRoadmapRoutes = new Elysia({ prefix: "/admin" })
  .use(requireAdminPlugin)
  .get("/", () =>
    createApiResponse({
      success: true,
      data: { message: "Hello from admin roadmap routes" },
    })
  )

  // Create a new roadmap event with items
  .post(
    "/",
    async ({ body, set, error }) => {
      try {
        const { phase, status, items } = body;
        const event = await prisma.roadmapEvent.create({
          data: {
            phase,
            status,
            items: { create: items },
          },
          include: { items: true },
        });

        set.status = 201;
        return createApiResponse({ success: true, data: event });
      } catch (err) {
        return error(
          400,
          createApiResponse({
            success: false,
            error: { message: "Failed to create roadmap event" },
          })
        );
      }
    },
    { body: CreateRoadmapSchema }
  )

  // Add a single item to an existing roadmap event
  .post(
    "/:id/item",
    async ({ body, params, set, error }) => {
      try {
        const { id } = params;
        const { title, completed, category } = body;
        const event = await prisma.roadmapEvent.update({
          where: { id: Number(id) },
          data: {
            items: { create: { title, category, completed } },
          },
          include: { items: true },
        });

        set.status = 201;
        return createApiResponse({ success: true, data: event });
      } catch (err) {
        return error(
          400,
          createApiResponse({
            success: false,
            error: { message: "Failed to create roadmap event item" },
          })
        );
      }
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: RoadmapItemSchema,
    }
  )

  // Update an event and "sync" its items atomically
  .put(
    "/:id",
    async ({ params, body, set, error }) => {
      try {
        const { id } = params;
        const { phase, status, items } = body;
        const eventId = Number(id);

        // Build dynamic update payload
        const updateData: any = { phase, status };

        if (Array.isArray(items)) {
          const hasItems = items.length > 0;
          const existingItems = hasItems
            ? items.filter((it: any) => typeof it.id !== "undefined")
            : [];
          const newItems = hasItems
            ? items
                .filter((it: any) => typeof it.id === "undefined")
                .map(({ id: _unused, ...rest }: any) => rest)
            : [];
          const existingIds = existingItems.map((it: any) => it.id);

          const itemOps: any = {};

          if (items.length === 0) {
            // Clear all items
            itemOps.deleteMany = {};
          } else {
            // Remove dropped items
            if (existingIds.length) {
              itemOps.deleteMany = { id: { notIn: existingIds } };
            }

            // Update existing ones
            if (existingItems.length) {
              itemOps.updateMany = existingItems.map((it: any) => ({
                where: { id: it.id },
                data: {
                  title: it.title,
                  completed: it.completed,
                  category: it.category,
                },
              }));
            }

            // Bulk-create new ones
            if (newItems.length) {
              itemOps.createMany = { data: newItems };
            }
          }

          updateData.items = itemOps;
        }

        const event = await prisma.roadmapEvent.update({
          where: { id: eventId },
          data: updateData,
          include: { items: true },
        });

        set.status = 200;
        return createApiResponse({ success: true, data: event });
      } catch (err) {
        return error(
          400,
          createApiResponse({
            success: false,
            error: { message: "Failed to update roadmap event" },
          })
        );
      }
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        phase: t.Optional(PhaseSchema),
        status: t.Optional(StatusSchema),
        items: t.Optional(t.Array(RoadmapItemSchema)),
      }),
    }
  )

  // Delete a roadmap event (and its items via cascade)
  .delete(
    "/:id",
    async ({ params, set, error }) => {
      try {
        const { id } = params;
        await prisma.roadmapEvent.delete({ where: { id: Number(id) } });
        set.status = 204;
        return createApiResponse({ success: true });
      } catch (err) {
        return error(
          400,
          createApiResponse({
            success: false,
            error: { message: "Failed to delete roadmap event" },
          })
        );
      }
    },
    { params: t.Object({ id: t.Numeric() }) }
  );
