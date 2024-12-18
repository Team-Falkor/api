import type { RouteHandler } from "../@types";

export const route: RouteHandler = {
  middleware: [
    async (request, params) => {
      console.log(`middleware ${request.url}`);
    },
  ],
  handler: async ({ params, body }) => {
    return new Response(`hello world!!`);
  },
};
