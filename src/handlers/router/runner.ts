import type { RouterHandler, RouterMiddleware, RouterResponse } from "./@types";
import type { RouterContext } from "./context";

export class Runner {
  constructor(private middlewares: RouterMiddleware[]) {}

  exec(
    fn: RouterHandler,
    context: RouterContext
  ): RouterResponse | Promise<RouterResponse> {
    const chainMiddlewares = ([
      firstMiddleware,
      ...restOfMiddlewares
    ]: RouterMiddleware[]): RouterHandler => {
      if (firstMiddleware) {
        return (context) => {
          return firstMiddleware(context, chainMiddlewares(restOfMiddlewares));
        };
      }
      return fn;
    };
    return chainMiddlewares(this.middlewares)(context);
  }
}
