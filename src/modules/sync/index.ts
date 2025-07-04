import Elysia from "elysia";
import { betterAuthPlugin } from "@/plugins/betterAuthPlugin";
import { createApiResponse, prisma } from "@/utils";

export const syncRoutes = new Elysia({ prefix: "/sync" })
	.use(betterAuthPlugin)
	.get(
		"/lists",
		async ({ user }) => {
			const userWithListsAndGameStats = await prisma.user.findUnique({
				where: {
					id: user.id,
				},
				select: {
					id: true,
					email: true,
					name: true,
					createdAt: true,
					updatedAt: true,
					username: true,
					displayUsername: true,
					lists: {
						select: {
							id: true,
							name: true,
							description: true,
							createdAt: true,
							updatedAt: true,
							listGames: {
								select: {
									id: true,
									addedAt: true,
									game: {
										select: {
											id: true,
											name: true,
											igdbID: true,
											steamID: true,
											createdAt: true,
											updatedAt: true,
											gameStats: {
												where: {
													userId: user.id,
												},
												select: {
													id: true,
													playtime: true,
													lastPlayed: true,
													gameId: true,
													userId: true,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});

			if (!userWithListsAndGameStats) {
				// If user not found, return an error API response with a 404 status
				return createApiResponse(
					{
						success: false,
						message: "User not found.",
						error: {
							message: "The requested user could not be found.",
							code: "USER_NOT_FOUND",
						},
					},
					{ status: 404 },
				);
			}

			// On success, return the data wrapped in a success API response
			return createApiResponse({
				success: true,
				data: userWithListsAndGameStats,
				message: "User lists and game stats retrieved successfully.",
			});
		},
		{
			auth: true,
		},
	)
	.get(
		"/games",
		async ({ user }) => {
			const games = await prisma.game.findMany({
				where: {
					OR: [
						{
							listGames: {
								some: {
									list: {
										userId: user.id,
									},
								},
							},
						},
						{
							gameStats: {
								some: {
									userId: user.id,
								},
							},
						},
					],
				},
				select: {
					id: true,
					name: true,
					igdbID: true,
					steamID: true,
					createdAt: true,
					updatedAt: true,
					gameStats: {
						where: {
							userId: user.id,
						},
						select: {
							id: true,
							playtime: true,
							lastPlayed: true,
						},
					},
				},
			});

			// On success, return the games wrapped in a success API response
			return createApiResponse({
				success: true,
				data: games,
				message: "User's games retrieved successfully.",
			});
		},
		{
			auth: true,
		},
	);
