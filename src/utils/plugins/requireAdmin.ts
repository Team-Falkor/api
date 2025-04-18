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
 * Elysia plugin to require admin privileges for a route.
 * Should be used after the authPlugin.
 * Adds `isAdmin` to context if user is admin.
 */
const requireAdminPlugin = (app: Elysia) =>
  app.use(authPlugin).derive(({ user, error }) => {
    if (!user) {
      console.warn("User not authenticated in requireAdminPlugin");
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
      console.warn(`User ${user.id} does not have admin privileges`);
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
      role: user.role,
    };
  });

export { requireAdminPlugin };
