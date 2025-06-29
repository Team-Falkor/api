import type Elysia from "elysia";
import { auth } from "@/lib/auth";
import { createApiResponse } from "@/utils";

const requireAdminRoute = (app: Elysia) =>
	app.derive(async ({ request: { headers }, set }) => {
		console.log("testing");
		const session = await auth.api.getSession({ headers });

		if (!session || !session.user) {
			set.status = 401;
			throw createApiResponse({
				success: false,
				message: "Authentication required",
				error: true,
			});
		}

		const user = session.user;

		const allowedRoles = ["admin", "owner"];

		if (!user.role || !allowedRoles.includes(user.role.toUpperCase())) {
			set.status = 403;
			throw createApiResponse({
				success: false,
				message: "Admin access required. Insufficient permissions.",
				error: true,
			});
		}

		return {
			adminUser: user,
			session: session.session,
		};
	});

export const createRoleGuard = (allowedRoles: string[]) => {
	return (app: Elysia) =>
		app.derive(async ({ request: { headers }, set }) => {
			const session = await auth.api.getSession({ headers });

			if (!session || !session.user) {
				set.status = 401;
				throw createApiResponse({
					success: false,
					message: "Authentication required",
					error: true,
				});
			}

			const user = session.user;

			if (!user.role || !allowedRoles.includes(user.role.toUpperCase())) {
				set.status = 403;
				throw createApiResponse({
					success: false,
					message: `Access denied. Required roles: ${allowedRoles.join(", ")}.`,
					error: true,
				});
			}

			return {
				authorizedUser: user,
				session: session.session,
			};
		});
};

export { requireAdminRoute };
