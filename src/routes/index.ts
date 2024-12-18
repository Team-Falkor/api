import type { RouterHandler } from "@/handlers/router";

export const GET: RouterHandler = async (context) => {
  return new Response("Hello World!");
};
