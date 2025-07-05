import Elysia from "elysia";
import { betterAuthPlugin } from "@/plugins/betterAuthPlugin";
import { cachePlugin } from "@/plugins/cachePlugin";
import { createApiResponse, prisma } from "@/utils";

export const syncRoutes = new Elysia({ prefix: "/sync" })
	.use(
		cachePlugin({
			namespace: "sync",
			maxSize: 500,
			ttl: 60 * 5, // 5 minutes
			logLevel: "info",
		}),
	)
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
											achievements: {
												select: {
													id: true,
													displayName: true,
													name: true,
													description: true,
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

			const transformedUserWithLists = {
				...userWithListsAndGameStats,
				lists: userWithListsAndGameStats.lists.map((list) => ({
					...list,
					listGames: list.listGames.map((listGame) => {
						const originalGame = listGame.game;

						const gameStatsForUser =
							originalGame.gameStats.length > 0
								? originalGame.gameStats[0]
								: {};

						const achievementsWithCombinedData = originalGame.achievements.map(
							(achievement) => {
								const userAchievementForUser =
									achievement.userAchievements.length > 0
										? achievement.userAchievements[0]
										: null;

								const {
									userAchievements: _userAchievements,
									...restOfAchievement
								} = achievement;

								return {
									...restOfAchievement,
									unlocked: userAchievementForUser?.unlocked ?? false,
									unlockedAt: userAchievementForUser?.unlockedAt ?? null,
									gameStats: gameStatsForUser,
								};
							},
						);

						const { gameStats: _gameStats, ...restOfGame } = originalGame;

						const transformedGame = {
							...restOfGame,
							...gameStatsForUser,
							achievements: achievementsWithCombinedData,
						};

						return {
							...listGame,
							game: transformedGame,
						};
					}),
				})),
			};

			return createApiResponse({
				success: true,
				data: transformedUserWithLists,
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
					achievements: {
						select: {
							id: true,
							displayName: true,
							name: true,
							description: true,
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

			const transformedGames = games.map((game) => {
				const gameStatsForUser =
					game.gameStats.length > 0 ? game.gameStats[0] : {};

				const achievementsWithCombinedData = game.achievements.map(
					(achievement) => {
						const userAchievementForUser =
							achievement.userAchievements.length > 0
								? achievement.userAchievements[0]
								: null;

						const {
							userAchievements: _userAchievements,
							...restOfAchievement
						} = achievement;

						return {
							...restOfAchievement,
							unlocked: userAchievementForUser?.unlocked ?? false,
							unlockedAt: userAchievementForUser?.unlockedAt ?? null,
							gameStats: gameStatsForUser,
						};
					},
				);

				const { gameStats: _gameStats, ...restOfGame } = game;

				return {
					...restOfGame,
					...gameStatsForUser,
					achievements: achievementsWithCombinedData,
				};
			});

			return createApiResponse({
				success: true,
				data: transformedGames,
				message:
					"User's games, stats, and achievements retrieved successfully.",
			});
		},
		{
			auth: true,
		},
	);
