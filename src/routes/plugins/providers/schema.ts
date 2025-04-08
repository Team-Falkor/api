import { t } from "elysia";

// Define the Plugin ID schema
const pluginIdSchema = t.String({
  pattern: "^([a-zA-Z0-9-_]+\\.[a-zA-Z0-9-_]+(\\.[a-zA-Z0-9-_]+)?)$",
});

// Define the Plugin Config schema
const pluginConfigSchema = t.Object({
  search: t.Optional(t.Array(t.String())),
});

// Define the Author schema
const authorSchema = t.Object({
  name: t.Optional(t.String()),
  url: t.Optional(t.String()),
});

// Define the main setup JSON schema
const setupJSONSchema = t.Object({
  id: pluginIdSchema,
  version: t.String(),
  config: t.Union([t.Literal(false), pluginConfigSchema]).default(false),
  multiple_choice: t.Boolean().default(false),
  name: t.String(),
  description: t.String(),
  logo: t.String(),
  banner: t.Optional(t.String()),
  api_url: t.Optional(t.String()),
  setup_path: t.Optional(t.String()),
  author: t.Optional(authorSchema),
});

export { authorSchema, pluginConfigSchema, pluginIdSchema, setupJSONSchema };
