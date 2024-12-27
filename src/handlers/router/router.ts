import { Console } from "@/utils";
import type { FileSystemRouter, Server } from "bun";
import type { Handlers, Method, RouterMiddleware } from "./@types";
import { RouterContext } from "./context";
import { Runner } from "./runner";

export const console = new Console({
  prefix: "[Router] ",
});
export class Router {
  private middlewares: RouterMiddleware[] = [];
  private router: FileSystemRouter;
  private server: Server | undefined;

  constructor(
    private options: { dir?: string; hostname?: string; port?: number } = {}
  ) {
    this.router = new Bun.FileSystemRouter({
      style: "nextjs",
      dir: this.options.dir || "./api",
      fileExtensions: [".ts", ".js"],
    });
  }

  setMiddlewares(middlewares: RouterMiddleware[]): void {
    this.middlewares = [...middlewares]; // Clone the array to avoid mutations.
  }

  async start(callback?: (server: Server) => void): Promise<void> {
    const { router, middlewares } = this;

    console.info(`Server starting on port ${this.options.port || 3000}...`);

    this.server = Bun.serve({
      hostname: this.options.hostname,
      port: this.options.port,
      async fetch(request, server) {
        const notFound = new Response("Not Found", { status: 404 });
        try {
          const method = request.method.toUpperCase() as Method;
          const url = new URL(request.url);
          const pathname = url.pathname;

          const matchedRoute = router.match(pathname);
          if (!matchedRoute) return notFound;

          const safeFilePath = matchedRoute.filePath; // File path validation can be enhanced if needed.
          if (!safeFilePath) return notFound;

          const handlers: Handlers = await import(safeFilePath);
          const handler = handlers[method] || handlers.default;

          if (!handler || typeof handler !== "function") {
            console.warn(`No valid handler found for ${method} at ${pathname}`);
            return notFound;
          }

          const routeMiddlewares: RouterMiddleware[] = [
            ...(handlers.middlewares || []),
            ...(handlers[`${method}_middlewares`] || []),
          ];

          const runner = new Runner([...middlewares, ...routeMiddlewares]);
          const context = new RouterContext(request, matchedRoute, server);

          const res = await runner.exec(handler, context);

          res.headers.set("Access-Control-Allow-Origin", "*");
          res.headers.set(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS"
          );

          return res || notFound;
        } catch (error) {
          console.error("Error during request handling:", error);
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    });

    console.info(
      `Server started on ${this.options.hostname || "localhost"}:${
        this.options.port || 3000
      }`
    );
    callback?.(this.server);
  }

  stop(closeActiveConnections = false): void {
    if (this.server) {
      console.info("Stopping server...");
      this.server.stop(closeActiveConnections);
      console.info("Server stopped.");
    } else {
      console.warn("Server is not running.");
    }
  }

  restart(callback?: (server: Server) => void): void {
    console.info("Restarting server...");
    this.stop(true);
    this.start(callback).catch((error) => {
      console.error("Error restarting server:", error);
    });
  }
}
