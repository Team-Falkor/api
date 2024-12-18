import { join } from "path";
import type { RouteHandler } from "../../@types";

const routesDir = join(import.meta.dir, "../../routes");

export const fileRouter = async (request: Request): Promise<Response> => {
  const { pathname, searchParams } = new URL(request.url);
  const segments = pathname.split("/").filter(Boolean);

  let currentDir = routesDir;
  const params: Record<string, string> = {};

  // Match the route file and collect params
  for (const segment of segments) {
    const possibleFile = join(currentDir, `${segment}.ts`);
    const dynamicSegment = `$${segment}`;
    const possibleDynamicFile = join(currentDir, `${dynamicSegment}.ts`);

    if (await Bun.file(possibleFile).exists()) {
      currentDir = possibleFile;
    } else if (await Bun.file(possibleDynamicFile).exists()) {
      params[segment] = segment; // Collect dynamic params
      currentDir = possibleDynamicFile;
    } else {
      return new Response("Not Found", { status: 404 });
    }
  }

  // Load route module dynamically
  try {
    const { route }: { route: RouteHandler } = await import(currentDir);

    // Schema validation
    if (route.schema?.params) {
      const validatedParams = route.schema.params.safeParse(params);
      if (!validatedParams.success) {
        return new Response("Invalid Params", { status: 400 });
      }
      Object.assign(params, validatedParams.data);
    }

    let body = undefined;
    if (route.schema?.body) {
      const json = await request.json().catch(() => null);
      if (json) {
        const validatedBody = route.schema.body.safeParse(json);
        if (!validatedBody.success) {
          return new Response("Invalid Body", { status: 400 });
        }
        body = validatedBody.data;
      }
    }

    const query = Object.fromEntries(searchParams.entries());
    if (route.schema?.query) {
      const validatedQuery = route.schema.query.safeParse(query);
      if (!validatedQuery.success) {
        return new Response("Invalid Query", { status: 400 });
      }
    }

    // Middleware execution
    if (route.middleware) {
      for (const middleware of route.middleware) {
        const middlewareResponse = await middleware(request, params);
        if (middlewareResponse) {
          return middlewareResponse; // Short-circuit if middleware returns a response
        }
      }
    }

    // Invoke the route handler
    return await route.handler({ request, params, body, query });
  } catch (err) {
    console.error(err);
    return new Response("Not Found", { status: 404 });
  }
};
