import { Elysia } from "elysia";
import { login, logout, me, refresh, register } from "../../handlers/auth";
import { authPlugin } from "../../utils/plugins/auth";

import { rateLimitPlugin } from "../../utils/plugins/rate-limit";
import { loginBodySchema, signupBodySchema } from "./schema";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(
    rateLimitPlugin({
      max: 100,
      windowMs: 1000 * 60 * 15, // 15 minutes
      message: "Too many requests, please try again later.",
    })
  )
  .post("/login", login, { body: loginBodySchema })
  .post("/sign-up", register, {
    body: signupBodySchema,
    error({ code, set, body }) {
      // Handle duplicate email error thrown by Prisma (code "P2002")
      if ((code as unknown) === "P2002") {
        set.status = "Conflict";
        return {
          name: "Error",
          message: `The email address provided ${body.email} already exists`,
        };
      }
    },
  })
  .post("/refresh", refresh)
  .use(authPlugin)
  .post("/logout", logout)
  .get("/me", me);
