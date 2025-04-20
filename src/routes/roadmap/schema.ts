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
