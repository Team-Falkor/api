import type { RouterContext } from "../context";

export type RouterHandler = (context: RouterContext) => RouterResponse;

export type RouterResponse = Promise<Response> | Response;

export type RouterMiddleware = (
  context: RouterContext,
  next: RouterHandler
) => RouterResponse;

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

export type Handlers = {
  default?: RouterHandler;
  GET?: RouterHandler;
  POST?: RouterHandler;
  PUT?: RouterHandler;
  PATCH?: RouterHandler;
  DELETE?: RouterHandler;
  OPTIONS?: RouterHandler;
  middlewares: RouterMiddleware[];
  GET_middlewares: RouterMiddleware[];
  POST_middlewares: RouterMiddleware[];
  PUT_middlewares: RouterMiddleware[];
  PATCH_middlewares: RouterMiddleware[];
  DELETE_middlewares: RouterMiddleware[];
  OPTIONS_middlewares: RouterMiddleware[];
};
