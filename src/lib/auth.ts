import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";

const prisma = new PrismaClient();

const BETTER_AUTH_TRUSTED_ORIGINS =
	process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") || [];

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "sqlite",
	}),
	basePath: "/auth",
	emailAndPassword: {
		enabled: true,
	},
	trustedOrigins: BETTER_AUTH_TRUSTED_ORIGINS,
	plugins: [username(), admin()],
});
