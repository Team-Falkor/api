import type { Prisma } from "@prisma/client";
import { prisma } from "@/utils";
import type { RoadmapModel } from "./model";

// Use namespace instead of static-only class
export namespace RoadmapService {
	export async function createRoadmapEvent(
		data: RoadmapModel.CreateRoadmapBody,
	) {
		const { phase, status, items } = data;
		return await prisma.roadmapEvent.create({
			data: {
				phase,
				status,
				items: { create: items },
			},
			include: { items: true },
		});
	}

	export async function addItemToEvent(
		eventId: number,
		itemData: RoadmapModel.RoadmapItemBody,
	) {
		const { title, completed, category } = itemData;
		return await prisma.roadmapEvent.update({
			where: { id: eventId },
			data: {
				items: { create: { title, category, completed } },
			},
			include: { items: true },
		});
	}

	export async function updateRoadmapEvent(
		eventId: number,
		data: RoadmapModel.UpdateRoadmapBody,
	) {
		const { phase, status, items } = data;

		// Build dynamic update payload
		const updateData: Prisma.RoadmapEventUpdateInput = { phase, status };

		if (Array.isArray(items)) {
			type ItemWithOptionalId = RoadmapModel.RoadmapItemBody;
			const hasItems = items.length > 0;
			const existingItems = hasItems
				? items.filter((it: ItemWithOptionalId) => typeof it.id !== "undefined")
				: [];
			const newItems = hasItems
				? items
						.filter((it: ItemWithOptionalId) => typeof it.id === "undefined")
						.map(({ id: _unused, ...rest }: ItemWithOptionalId) => rest)
				: [];
			const existingIds = existingItems
				.map((it: ItemWithOptionalId) => it.id)
				.filter((id): id is number => typeof id === "number");

			const itemOps: Prisma.RoadmapEventItemUpdateManyWithoutRoadmapEventNestedInput =
				{};

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
					itemOps.updateMany = existingItems.map((it: ItemWithOptionalId) => ({
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

		return await prisma.roadmapEvent.update({
			where: { id: eventId },
			data: updateData,
			include: { items: true },
		});
	}

	export async function deleteRoadmapEvent(eventId: number) {
		return await prisma.roadmapEvent.delete({
			where: { id: eventId },
		});
	}
}
