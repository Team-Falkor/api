import { Role } from "@prisma/client";
import Elysia from "elysia";
import { Console } from "../console";
import { createResponse } from "../response";
import { authPlugin } from "./auth";

const console = new Console({
  prefix: "[REQUIRE ADMIN PLUGIN]: ",
  useTimestamp: false,
});

/**
 * Plugin that checks if the authenticated user has admin privileges
 * This plugin builds on top of the authPlugin and should be used after it
 */
const requireAdminPlugin = (app: Elysia) =>
  app.use(authPlugin).derive(({ user, error }) => {
    if (!user) {
      return error(
        401,
        createResponse({
          message: "Authentication required",
          success: false,
          error: true,
        })
      );
    }

    if (user.role !== Role.ADMIN) {
      return error(
        403,
        createResponse({
          message: "Admin privileges required",
          success: false,
          error: true,
        })
      );
    }

    return {
      isAdmin: true,
    };
  });

export { requireAdminPlugin };
