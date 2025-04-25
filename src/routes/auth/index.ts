import { Elysia } from "elysia";
import { login, logout, me, refresh, register } from "../../handlers/auth";
import { authPlugin } from "../../utils/plugins/auth";

import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { createApiResponse } from "../../utils/response";
import { loginBodySchema, signupBodySchema } from "./schema";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post("/login", login, { body: loginBodySchema })
  .post("/sign-up", register, {
    body: signupBodySchema,
    error({ set, error }) {
      // Prisma unique constraint violation (e.g. duplicate email/username)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        set.status = 409;
        const field = Array.isArray(error.meta?.target)
          ? error.meta.target.join(", ")
          : error.meta?.target;
        return createApiResponse({
          success: false,
          message: `The '${field}' you provided is already in use.`,
          error: {
            code: "DUPLICATE_FIELD",
            message: `The '${field}' you provided is already in use.`,
          },
        });
      }

      // Zod validation error
      if (error instanceof ZodError) {
        set.status = 400;
        const message = "Invalid sign-up data.";
        return createApiResponse({
          success: false,
          message,
          error: {
            code: "INVALID_SIGNUP_DATA",
            message,
          },
        });
      }

      // Fallback: unexpected server error
      set.status = 500;
      const message =
        "An unexpected error occurred while creating your account.";
      return createApiResponse({
        success: false,
        message,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message,
        },
      });
    },
  })
  .post("/refresh", refresh)
  .use(authPlugin)
  .post("/logout", logout)
  .get("/me", me);
