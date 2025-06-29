import type { PluginSetupJSON } from "@team-falkor/shared-types";
import pLimit from "p-limit";
import { ProviderHandler } from "@/handlers/providers";
import { Console, prisma } from "@/utils";
import { CONCURRENCY_LIMIT, FETCH_TIMEOUT_MS, MAX_FAILURES } from "./constants";

const handler = new ProviderHandler();

const extractErrorMessage = (error: unknown): string => {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
};

export const checkProviders = async (): Promise<boolean> => {
	Console.info("Starting provider check...");

	const providers = await prisma.provider.findMany({
		where: { approved: true },
		select: { id: true, setupUrl: true, failureCount: true, setupJSON: true },
	});

	if (providers.length === 0) {
		Console.info("No approved providers to check.");
		return true;
	}

	let anyProviderFailed = false;
	const limit = pLimit(CONCURRENCY_LIMIT);
	const updatePromises: Promise<unknown>[] = [];

	const checkPromises = providers.map((provider) =>
		limit(async () => {
			const { id, setupUrl, failureCount, setupJSON: rawSetupJSON } = provider;

			// 1) URL‐format failures
			if (
				!setupUrl ||
				(!setupUrl.startsWith("http://") && !setupUrl.startsWith("https://"))
			) {
				Console.warn(`Provider ${id}: Invalid URL "${setupUrl}".`);
				const newFailureCount = failureCount + 1;
				const updateData: { failureCount: number; approved?: boolean } = {
					failureCount: newFailureCount,
				};
				// <-- only unapprove if strictly greater than MAX_FAILURES
				if (newFailureCount > MAX_FAILURES) updateData.approved = false;

				updatePromises.push(
					prisma.provider.update({ where: { id }, data: updateData }),
				);
				anyProviderFailed = true;
				return;
			}

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

			try {
				const response = await fetch(setupUrl, { signal: controller.signal });
				clearTimeout(timeoutId);

				// 2) HTTP errors
				if (!response.ok) {
					const responseText = await response
						.text()
						.catch(() => "<unreadable>");
					Console.warn(
						`Provider ${id}: HTTP ${response.status} ${response.statusText}. Body: ${responseText}`,
					);
					const newFailureCount = failureCount + 1;
					const updateData: { failureCount: number; approved?: boolean } = {
						failureCount: newFailureCount,
					};
					// <-- only unapprove if strictly greater than MAX_FAILURES
					if (newFailureCount > MAX_FAILURES) {
						Console.error(
							`Provider ${id}: Unapproving due to repeated failures.`,
						);
						updateData.approved = false;
					}

					updatePromises.push(
						prisma.provider.update({ where: { id }, data: updateData }),
					);
					anyProviderFailed = true;
					return;
				}

				// 3) JSON‐parse failures
				let fetchedJson: unknown;
				try {
					Console.info(`Provider ${id}: Fetching JSON from ${setupUrl}...`);
					fetchedJson = await response.json();
				} catch (jsonError) {
					const message = extractErrorMessage(jsonError);
					Console.warn(`Provider ${id}: Failed to parse JSON. ${message}`);
					const newFailureCount = failureCount + 1;
					const updateData: { failureCount: number; approved?: boolean } = {
						failureCount: newFailureCount,
					};
					// <-- only unapprove if strictly greater than MAX_FAILURES
					if (newFailureCount > MAX_FAILURES) updateData.approved = false;

					updatePromises.push(
						prisma.provider.update({ where: { id }, data: updateData }),
					);
					anyProviderFailed = true;
					return;
				}

				// 4) validation failures against your schema
				let fetchedSetup: PluginSetupJSON;
				try {
					fetchedSetup = handler.validate(fetchedJson);
				} catch (validationError) {
					const message = extractErrorMessage(validationError);
					Console.warn(
						`Provider ${id}: Invalid fetched setup JSON. ${message}`,
					);
					const newFailureCount = failureCount + 1;
					const updateData: { failureCount: number; approved?: boolean } = {
						failureCount: newFailureCount,
					};
					// <-- only unapprove if strictly greater than MAX_FAILURES
					if (newFailureCount > MAX_FAILURES) updateData.approved = false;

					updatePromises.push(
						prisma.provider.update({ where: { id }, data: updateData }),
					);
					anyProviderFailed = true;
					return;
				}

				// 5) DB‐stored‐JSON validation
				let dbSetup: PluginSetupJSON;
				try {
					const json =
						typeof rawSetupJSON === "string"
							? JSON.parse(rawSetupJSON)
							: rawSetupJSON;
					dbSetup = handler.validate(json);
				} catch (dbError) {
					const message = extractErrorMessage(dbError);
					Console.warn(`Provider ${id}: Corrupted DB setupJSON. ${message}`);
					const newFailureCount = failureCount + 1;
					const updateData: { failureCount: number; approved?: boolean } = {
						failureCount: newFailureCount,
					};
					// <-- only unapprove if strictly greater than MAX_FAILURES
					if (newFailureCount > MAX_FAILURES) updateData.approved = false;

					updatePromises.push(
						prisma.provider.update({ where: { id }, data: updateData }),
					);
					anyProviderFailed = true;
					return;
				}

				// 6) version sync / reset failureCount
				if (fetchedSetup.version !== dbSetup.version) {
					Console.info(
						`Provider ${id}: Version mismatch (DB: ${dbSetup.version}, Remote: ${fetchedSetup.version}). Updating...`,
					);
					updatePromises.push(
						prisma.provider.update({
							where: { id },
							data: {
								setupJSON: JSON.stringify(fetchedSetup),
								failureCount: 0,
							},
						}),
					);
				} else if (failureCount > 0) {
					Console.info(
						`Provider ${id}: Version matches. Resetting failure count.`,
					);
					updatePromises.push(
						prisma.provider.update({
							where: { id },
							data: { failureCount: 0 },
						}),
					);
				}
			} catch (error) {
				clearTimeout(timeoutId);
				const message = extractErrorMessage(error);

				if ((error as Error).name === "AbortError") {
					Console.error(`Provider ${id}: Timeout after ${FETCH_TIMEOUT_MS}ms.`);
				} else {
					Console.error(`Provider ${id}: Fetch error. ${message}`);
				}

				const newFailureCount = failureCount + 1;
				const updateData: { failureCount: number; approved?: boolean } = {
					failureCount: newFailureCount,
				};
				// <-- only unapprove if strictly greater than MAX_FAILURES
				if (newFailureCount > MAX_FAILURES) {
					Console.error(`Provider ${id}: Too many failures. Unapproving.`);
					updateData.approved = false;
				}

				updatePromises.push(
					prisma.provider.update({ where: { id }, data: updateData }),
				);
				anyProviderFailed = true;
			}
		}),
	);

	await Promise.all(checkPromises);

	Console.info(
		`Finished provider checks. Committing ${updatePromises.length} DB updates...`,
	);

	try {
		await Promise.all(updatePromises);
		Console.info("All updates committed.");
	} catch (dbError) {
		Console.error("Database update error:", extractErrorMessage(dbError));
		anyProviderFailed = true;
	}

	const success = !anyProviderFailed;
	Console.info(`Health check result: ${success ? "SUCCESS" : "FAILURE"}`);
	return success;
};
