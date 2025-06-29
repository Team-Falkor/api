import Elysia from "elysia";
import { requireAdminRoute } from "@/plugins/requireAdminRoute";
import { createApiResponse } from "@/utils";
import { RoadmapModel } from "./model";
import { RoadmapService } from "./service";

export const adminRoadmapRoutes = new Elysia({ prefix: "/admin" })
	.use(requireAdminRoute)
	.get("/", () =>
		createApiResponse({
			success: true,
			data: { message: "Hello from admin roadmap routes" },
		}),
	)

	// Create a new roadmap event with items
	.post(
		"/",
		async ({ body, set, error }) => {
			try {
				const event = await RoadmapService.createRoadmapEvent(body);
				set.status = 201;
				return createApiResponse({ success: true, data: event });
			} catch {
				return error(
					400,
					createApiResponse({
						success: false,
						error: { message: "Failed to create roadmap event" },
					}),
				);
			}
		},
		{ body: RoadmapModel.createRoadmapBody },
	)

	// Add a single item to an existing roadmap event
	.post(
		"/:id/item",
		async ({ body, params, set, error }) => {
			try {
				const { id } = params;
				const event = await RoadmapService.addItemToEvent(Number(id), body);
				set.status = 201;
				return createApiResponse({ success: true, data: event });
			} catch {
				return error(
					400,
					createApiResponse({
						success: false,
						error: { message: "Failed to create roadmap event item" },
					}),
				);
			}
		},
		{
			params: RoadmapModel.roadmapParams,
			body: RoadmapModel.roadmapItemBody,
		},
	)

	// Update an event and "sync" its items atomically
	.put(
		"/:id",
		async ({ params, body, set, error }) => {
			try {
				const { id } = params;
				const eventId = Number(id);
				const event = await RoadmapService.updateRoadmapEvent(eventId, body);
				set.status = 200;
				return createApiResponse({ success: true, data: event });
			} catch {
				return error(
					400,
					createApiResponse({
						success: false,
						error: { message: "Failed to update roadmap event" },
					}),
				);
			}
		},
		{
			params: RoadmapModel.roadmapParams,
			body: RoadmapModel.updateRoadmapBody,
		},
	)

	// Delete a roadmap event (and its items via cascade)
	.delete(
		"/:id",
		async ({ params, set, error }) => {
			try {
				const { id } = params;
				await RoadmapService.deleteRoadmapEvent(Number(id));
				set.status = 204;
				return createApiResponse({ success: true });
			} catch {
				return error(
					400,
					createApiResponse({
						success: false,
						error: { message: "Failed to delete roadmap event" },
					}),
				);
			}
		},
		{ params: RoadmapModel.roadmapParams },
	);
