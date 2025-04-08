import jwt from "@elysiajs/jwt";
import Elysia from "elysia";
import { Console } from "../console";
import { prisma } from "../prisma";
import { createResponse } from "../response";

const console = new Console({
  prefix: "[AUTH PLUGIN]: ",
  useTimestamp: false,
});

// Define a strong default secret for development only
const DEFAULT_JWT_SECRET = "your-secret-key";
const JWT_SECRET = Bun.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;

// Check if we're using the default secret and throw an error in production
if (JWT_SECRET === DEFAULT_JWT_SECRET) {
  if (Bun.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production environment");
  } else {
    console.warn(
      console.styleText(
        "JWT_SECRET should not be equal to default value in production, please set it in .env file",
        ["bold", "yellow"]
      )
    );
  }
}

// Validate that the JWT secret is strong enough
if (JWT_SECRET.length < 32) {
  console.warn(
    console.styleText(
      "JWT_SECRET should be at least 32 characters long for security",
      ["bold", "yellow"]
    )
  );
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
      if (!accessToken.value) {
        return error(
          401,
          createResponse({
            message: "Access token is missing",
            success: false,
            error: true,
          })
        );
      }
      const jwtPayload = await jwt.verify(accessToken.value);
      if (!jwtPayload) {
        return error(
          403,
          createResponse({
            message: "Access token is invalid",
            success: false,
            error: true,
          })
        );
      }

      const userId = jwtPayload.sub;
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!user) {
        return error(
          403,
          createResponse({
            message: "User not found",
            success: false,
            error: true,
          })
        );
      }

      return {
        user,
      };
    });

export { authPlugin };
