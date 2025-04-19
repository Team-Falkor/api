// src/schemas/schema.ts

import { t } from "elysia";

export const sessionIdSchema = t.String({
  minLength: 36,
  maxLength: 36,
  error() {
    return "Invalid sessionId format.";
  },
});

export const dataRetentionSchema = t.Object({
  dataType: t.Union([
    t.Literal("pageview"),
    t.Literal("event"),
    t.Literal("metrics"),
  ]),
  retentionDays: t.Number({
    minimum: 1,
    error() {
      return "Retention days must be at least 1.";
    },
  }),
});

export const aggregateMetricsSchema = t.Object({
  metricType: t.String(),
  value: t.Number(),
  period: t.String(),
  startTime: t.Date(),
  endTime: t.Date(),
});

export const pageviewSchema = t.Object({
  path: t.String({
    minLength: 1,
    error() {
      return "Path must be at least 1 character long.";
    },
  }),
  sessionId: sessionIdSchema,
  userAgent: t.Optional(t.String()),
  countryCode: t.Optional(t.String()),
});

export const eventSchema = t.Object({
  eventType: t.String(),
  path: t.String(),
  sessionId: sessionIdSchema,
  context: t.Optional(t.Any()),
});

export const timeRangeSchema = t.Object({
  from: t.Optional(t.Date()),
  to: t.Optional(t.Date()),
});
