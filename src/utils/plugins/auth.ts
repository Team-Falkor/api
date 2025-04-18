import jwt from "@elysiajs/jwt";
import Elysia from "elysia";
import { Console } from "../console";
import { prisma } from "../prisma";
import { createApiResponse } from "../response";

const console = new Console({
  prefix: "[AUTH PLUGIN]: ",
  useTimestamp: false,
});

const DEFAULT_JWT_SECRET = "your-secret-key";
const JWT_SECRET = Bun.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;

if (
  JWT_SECRET === DEFAULT_JWT_SECRET ||
  !JWT_SECRET ||
  JWT_SECRET.length < 32
) {
  if (Bun.env.NODE_ENV === "production") {
    throw new Error(
      "A strong JWT_SECRET (min 32 chars, not default) must be set in production environment"
    );
  } else {
    console.warn(
      console.styleText(
        "⚠️  JWT_SECRET should be at least 32 characters and not default in production. Set it in your .env.",
        ["bold", "yellow"]
      )
    );
  }
}

const authPlugin = (app: Elysia) =>
  app
    .use(
      jwt({
        name: "jwt",
        secret: JWT_SECRET,
      })
    )
    .derive(async ({ jwt, error, cookie: { accessToken }, set }) => {
      if (!accessToken?.value) {
        return error(
          401,
          createApiResponse({
            message: "Unauthorized",
            success: false,
            error: true,
          })
        );
      }

      let jwtPayload;
      try {
        jwtPayload = await jwt.verify(accessToken.value);
      } catch {
        return error(
          403,
          createApiResponse({
            message: "Invalid or expired access token",
            success: false,
            error: true,
          })
        );
      }

      if (!jwtPayload || typeof jwtPayload !== "object" || !jwtPayload.sub) {
        return error(
          403,
          createApiResponse({
            message: "Malformed JWT payload",
            success: false,
            error: true,
          })
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: jwtPayload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          isOnline: true,
          role: true,
        },
      });

      if (!user) {
        return error(
          403,
          createApiResponse({
            message: "User not found",
            success: false,
            error: true,
          })
        );
      }

      return { user };
    });

export { authPlugin };
