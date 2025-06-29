import { AnalyticsHandler } from "@/handlers/analytics";
import { getCountryCodeFromIp } from "@/utils";
import type { AnalyticsModel } from "./model";

const analytics = new AnalyticsHandler();

export namespace AnalyticsService {
	export async function recordPageView(
		pageviewData: AnalyticsModel.Pageview,
		ip?: string,
	): Promise<{ success: boolean; message?: string; error?: string }> {
		try {
			// Add country code if not provided and IP is available
			if (!pageviewData.countryCode && ip) {
				pageviewData.countryCode = await getCountryCodeFromIp(ip);
			}

			await analytics.recordPageView(pageviewData);

			return {
				success: true,
				message: "Page view recorded successfully",
			};
		} catch (error: unknown) {
			console.error(
				"Error recording page view:",
				error instanceof Error ? error.message : String(error),
			);
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to record page view",
			};
		}
	}

	export async function recordEvent(
		eventData: AnalyticsModel.Event,
	): Promise<{ success: boolean; message?: string; error?: string }> {
		try {
			await analytics.recordEvent(eventData);

			return {
				success: true,
				message: "Event recorded successfully",
			};
		} catch (error: unknown) {
			console.error(
				"Error recording event:",
				error instanceof Error ? error.message : String(error),
			);
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to record event",
			};
		}
	}
}
