import { ZodType } from "zod";

// Middleware type
export type Middleware = (
  request: Request,
  params: Record<string, string>
) => Promise<Response | void>;

// Route Handler Type
export interface RouteHandler<
  Params extends Record<string, string> = Record<string, string>,
  Body = unknown,
  Query = unknown
> {
  schema?: {
    params?: ZodType<Params>;
    body?: ZodType<Body>;
    query?: ZodType<Query>;
  };
  middleware?: Middleware[];
  handler: (context: {
    request: Request;
    params: Params;
    body?: Body;
    query?: Query;
  }) => Promise<Response>;
}
