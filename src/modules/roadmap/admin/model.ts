import { Phase, Status } from "@prisma/client";
import { t } from "elysia";

export const PhaseSchema = t.Enum(Phase);
export const StatusSchema = t.Enum(Status);

export const ItemSchema = t.Object({
	id: t.Numeric(),
	title: t.String(),
	completed: t.Boolean(),
});

export const RoadmapItemSchema = t.Object({
	id: t.Optional(t.Numeric()),
	title: t.String(),
	completed: t.Boolean(),
	category: t.Optional(t.String()),
});

export const CreateRoadmapItemSchema = t.Object({
	title: t.String(),
	completed: t.Boolean(),
	category: t.Optional(t.String()),
});

export const CreateRoadmapSchema = t.Object({
	phase: PhaseSchema,
	status: StatusSchema,
	items: t.Optional(t.Array(CreateRoadmapItemSchema)),
});

export namespace RoadmapModel {
	export const createRoadmapBody = CreateRoadmapSchema;
	export type CreateRoadmapBody = typeof createRoadmapBody.static;

	export const roadmapItemBody = RoadmapItemSchema;
	export type RoadmapItemBody = typeof roadmapItemBody.static;

	export const updateRoadmapBody = t.Object({
		phase: t.Optional(PhaseSchema),
		status: t.Optional(StatusSchema),
		items: t.Optional(t.Array(RoadmapItemSchema)),
	});
	export type UpdateRoadmapBody = typeof updateRoadmapBody.static;

	export const roadmapParams = t.Object({ id: t.Numeric() });
	export type RoadmapParams = typeof roadmapParams.static;
}
