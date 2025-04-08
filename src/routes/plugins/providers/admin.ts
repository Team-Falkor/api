import Elysia, { t } from "elysia";
import { ProviderHandler } from "../../../handlers/providers";
import { requireAdminPlugin } from "../../../utils/plugins";
import { createResponse } from "../../../utils/response";

const provider = new ProviderHandler();

export const providerAdminRoutes = new Elysia({ prefix: "/admin" })
  .use(requireAdminPlugin)
  .get(
    "/pending",
    async ({ query, set, error }) => {
      try {
        const { skip, take, sortBy, sortOrder } = query;

        // Get providers awaiting review
        const pendingProviders = await provider.getPendingProviders({
          skip,
          take,
          sortBy,
          sortOrder,
        });

        set.status = 200;
        return createResponse({
          success: true,
          message: "Pending providers retrieved successfully",
          data: pendingProviders,
        });
      } catch (e) {
        console.error(
          "Error retrieving pending providers:",
          e instanceof Error ? e.message : String(e)
        );
        return error(
          500,
          createResponse({
            success: false,
            message: "Failed to retrieve pending providers",
            error: true,
          })
        );
      }
    },
    {
      query: t.Optional(
        t.Object({
          skip: t.Optional(t.Number()),
          take: t.Optional(t.Number()),
          sortBy: t.Optional(
            t.Union([t.Literal("createdAt"), t.Literal("name")])
          ),
          sortOrder: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
        })
      ),
    }
  )
  .delete(
    "/",
    async ({ body, set, error }) => {
      const { id } = body;

      try {
        // Check if provider exists
        const existingProvider = await provider.getProvider(id);
        if (!existingProvider) {
          return error(
            404,
            createResponse({
              success: false,
              message: `Provider with ID ${id} not found`,
              error: true,
            })
          );
        }

        // Delete the provider
        const deletedProvider = await provider.deleteProvider(id);

        set.status = 200;
        return createResponse({
          success: true,
          message: "Provider deleted successfully",
          data: deletedProvider,
        });
      } catch (e) {
        console.error(
          "Error deleting provider:",
          e instanceof Error ? e.message : String(e)
        );
        return error(
          500,
          createResponse({
            success: false,
            message: "Failed to delete provider",
            error: true,
          })
        );
      }
    },
    {
      body: t.Object({
        id: t.Number(),
      }),
    }
  )
  .patch(
    "/approve",
    async ({ body, set, error }) => {
      const { id } = body;

      try {
        // Approve the provider
        const approvedProvider = await provider.approveProvider(id);

        set.status = 200;
        return createResponse({
          success: true,
          message: "Provider approved successfully",
          data: approvedProvider,
        });
      } catch (e) {
        // Check if provider not found
        if (e instanceof Error && e.message.includes("not found")) {
          return error(
            404,
            createResponse({
              success: false,
              message: e.message,
              error: true,
            })
          );
        }

        console.error(
          "Error approving provider:",
          e instanceof Error ? e.message : String(e)
        );
        return error(
          500,
          createResponse({
            success: false,
            message: "Failed to approve provider",
            error: true,
          })
        );
      }
    },
    {
      body: t.Object({
        id: t.Number(),
      }),
    }
  );
