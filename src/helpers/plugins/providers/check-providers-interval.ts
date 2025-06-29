import { Console, prisma } from "@/utils";
import { checkProviders } from "./check-providers";
import { NORMAL_INTERVAL_MS } from "./constants";

let schedulerTimeoutId: NodeJS.Timeout | null = null;

/**
 * Retrieves the existing health check state or creates it if it doesn't exist.
 */
const getOrCreateHealthCheckState = async () => {
	const state = await prisma.healthCheckState.findFirst({ where: { id: 1 } });

	if (!state) {
		Console.withTimestamp().log(
			"No health check state found (ID 1). Initializing...",
		);
		try {
			return await prisma.healthCheckState.create({
				data: {
					id: 1,
					lastCheckCompletionTime: new Date(),
					wasLastCheckSuccessful: true,
				},
			});
		} catch {
			Console.warn(
				"Attempted to create HealthCheckState but it likely already exists. Retrying find.",
			);
			return prisma.healthCheckState.findUniqueOrThrow({ where: { id: 1 } });
		}
	}

	return state;
};

/**
 * Persists the health check state to the database.
 */
const saveHealthCheckState = async (state: {
	lastCheckCompletionTime: Date;
	wasLastCheckSuccessful: boolean;
}) => {
	await prisma.healthCheckState.update({
		where: { id: 1 },
		data: state,
	});
};

/**
 * Schedules the next health check run based on the given interval.
 * @param intervalMs Milliseconds to wait before the next check
 */
const scheduleNextCheck = async (intervalMs: number) => {
	if (schedulerTimeoutId) {
		clearTimeout(schedulerTimeoutId);
	}

	const maxInterval = NORMAL_INTERVAL_MS * 2;
	const actualIntervalMs = Math.max(0, Math.min(intervalMs, maxInterval));

	schedulerTimeoutId = setTimeout(async () => {
		Console.withTimestamp().log(
			"--- Starting scheduled provider check run ---",
		);

		const isSuccessful = await checkProviders();

		const newState = {
			lastCheckCompletionTime: new Date(),
			wasLastCheckSuccessful: isSuccessful,
		};

		await saveHealthCheckState(newState);
		Console.withTimestamp().log(
			`State saved: last success = ${
				newState.wasLastCheckSuccessful
			}, completed at ${newState.lastCheckCompletionTime.toISOString()}`,
		);

		Console.withTimestamp().log(
			`Scheduling next check in ${NORMAL_INTERVAL_MS}ms (normal interval).`,
		);

		await scheduleNextCheck(NORMAL_INTERVAL_MS);
	}, actualIntervalMs);

	const nextRunTime = new Date(Date.now() + actualIntervalMs);
	Console.withTimestamp().log(
		`Next provider check run scheduled in ${actualIntervalMs}ms at ${nextRunTime.toISOString()}`,
	);
};

/**
 * Starts the provider health check scheduler.
 * Determines when the first check should run based on previous state.
 */
export const startProviderCheckScheduler = async () => {
	Console.withTimestamp().log("Starting provider check scheduler...");

	const state = await getOrCreateHealthCheckState();
	const now = new Date();

	const expectedNextNormalCheck = new Date(
		state.lastCheckCompletionTime.getTime() + NORMAL_INTERVAL_MS,
	);
	const timeUntilExpected = expectedNextNormalCheck.getTime() - now.getTime();

	let initialDelay: number;

	if (!state.wasLastCheckSuccessful || timeUntilExpected <= 0) {
		initialDelay = 100;
		Console.warn(
			`Scheduler state indicates last check failed or schedule was missed. Scheduling first check soon (${initialDelay}ms).`,
		);
	} else {
		initialDelay = timeUntilExpected;
		Console.withTimestamp().log(
			`Scheduler state indicates success and on schedule. Scheduling first check at expected time.`,
		);
	}

	await scheduleNextCheck(initialDelay);
};

/**
 * Stops the provider health check scheduler.
 * Clears any scheduled timeout.
 */
export const stopProviderCheckScheduler = () => {
	if (schedulerTimeoutId) {
		Console.withTimestamp().log("Stopping provider check scheduler...");
		clearTimeout(schedulerTimeoutId);
		schedulerTimeoutId = null;
	}
};

/**
 * Performs a dry run of the provider health check without updating the database.
 * This is useful for testing purposes.
 */
export const dryRunProviderCheck = async () => {
	Console.withTimestamp().log("--- DRY RUN: Starting provider check ---");
	const result = await checkProviders();
	Console.withTimestamp().log(`--- DRY RUN COMPLETE: Success = ${result} ---`);
};
