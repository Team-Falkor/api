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
											// Include global achievements for this game
											achievements: {
												select: {
													id: true,
													displayName: true,
													name: true,
													description: true,
													// Include user-specific achievement status for the current user
													userAchievements: {
														where: {
															userId: user.id,
														},
														select: {
															id: true,
															unlocked: true,
															unlockedAt: true,
														},
													},
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

			return createApiResponse({
				success: true,
				data: userWithListsAndGameStats,
				message:
					"User lists, games, stats, and achievements retrieved successfully.",
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
						{
							// Also include games if the user has an achievement for it,
							// even if not in a list or having gameStats
							achievements: {
								some: {
									userAchievements: {
										some: {
											userId: user.id,
										},
									},
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
					// Include global achievements for this game
					achievements: {
						select: {
							id: true,
							displayName: true,
							name: true,
							description: true,
							// Include user-specific achievement status for the current user
							userAchievements: {
								where: {
									userId: user.id,
								},
								select: {
									id: true,
									unlocked: true,
									unlockedAt: true,
								},
							},
						},
					},
				},
			});

			return createApiResponse({
				success: true,
				data: games,
				message:
					"User's games, stats, and achievements retrieved successfully.",
			});
		},
		{
			auth: true,
		},
	);
