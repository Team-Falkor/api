import jwt from "@elysiajs/jwt";
import Elysia, { type Static, t } from "elysia";
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
			"A strong JWT_SECRET (min 32 chars, not default) must be set in production environment",
		);
	}
	console.warn(
		console.styleText(
			"⚠️  JWT_SECRET should be at least 32 characters and not default in production. Set it in your .env.",
			["bold", "yellow"],
		),
	);
}

/**
 * Defines the expected payload structure for all JWTs.
 * The `sub` (subject) claim is used to store the user's ID.
 * This schema provides both runtime validation and static typing.
 */
const jwtPayloadSchema = t.Object({
	sub: t.String(),
});

/**
 * An Elysia plugin that enforces authentication for protected routes.
 *
 * It verifies a JWT from the `accessToken` cookie. If the token is valid,
 * it fetches the corresponding user from the database and attaches them
 * to the request context as `user`.
 *
 * @param {Elysia} app The Elysia app instance.
 * @returns The app instance with the authentication guard.
 */
const authPlugin = (app: Elysia) =>
	app
		.use(
			jwt({
				name: "jwt",
				secret: JWT_SECRET,
				schema: jwtPayloadSchema,
			}),
		)
		.derive(async ({ jwt, error, cookie: { accessToken } }) => {
			if (!accessToken?.value) {
				return error(
					401,
					createApiResponse({
						message: "Unauthorized",
						success: false,
						error: true,
					}),
				);
			}

			// Explicitly type `jwtPayload` to satisfy the linter.
			// It can be the payload object or `false` if verification fails.
			let jwtPayload: Static<typeof jwtPayloadSchema> | false;

			try {
				jwtPayload = await jwt.verify(accessToken.value);
			} catch {
				return error(
					403,
					createApiResponse({
						message: "Invalid or expired access token",
						success: false,
						error: true,
					}),
				);
			}

			// This check is a safeguard in case `verify` returns false instead of throwing.
			if (!jwtPayload) {
				return error(
					403,
					createApiResponse({
						message: "Invalid JWT payload",
						success: false,
						error: true,
					}),
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
					}),
				);
			}

			return { user };
		});

export { authPlugin };
