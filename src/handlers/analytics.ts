import {
	isValidUUID,
	type Prisma,
	prisma,
	SimpleUAParser,
	generateUUID as uuidv4,
} from "@/utils";

export class AnalyticsHandler {
	private db = prisma;

	async recordPageView(data: {
		path: string;
		userAgent?: string;
		countryCode?: string;
		sessionId: string;
	}): Promise<void> {
		if (!isValidUUID(data.sessionId)) {
			throw new Error("Invalid sessionId format.");
		}
		const parser = data.userAgent ? new SimpleUAParser(data.userAgent) : null;
		const deviceType = parser?.getDevice()?.type ?? "unknown";
		const browser = parser?.getBrowser()?.name ?? "unknown";

		await this.db.pageView.create({
			data: {
				path: data.path,
				sessionId: data.sessionId,
				deviceType,
				browser,
				country: data.countryCode ?? "unknown",
				timestamp: new Date(),
			},
		});
	}

	async recordEvent(data: {
		eventType: string;
		path: string;
		context?: Prisma.JsonValue;
		sessionId: string;
	}): Promise<void> {
		if (!isValidUUID(data.sessionId)) {
			throw new Error("Invalid sessionId format.");
		}
		await this.db.eventLog.create({
			data: {
				eventType: data.eventType,
				path: data.path,
				sessionId: data.sessionId,
				context: data.context ?? {},
				timestamp: new Date(),
			},
		});
	}

	async updateAggregateMetrics(data: {
		metricType: string;
		value: number;
		period: string;
		startTime: Date;
		endTime: Date;
	}): Promise<void> {
		await this.db.aggregateMetrics.upsert({
			where: {
				metricType_period_startTime: {
					metricType: data.metricType,
					period: data.period,
					startTime: data.startTime,
				},
			},
			create: {
				id: uuidv4(),
				...data,
			},
			update: {
				value: data.value,
				endTime: data.endTime,
			},
		});
	}

	async manageDataRetention(
		dataType: string,
		retentionDays: number,
	): Promise<void> {
		await this.db.dataRetentionPolicy.upsert({
			where: { dataType },
			create: {
				dataType,
				retentionDays,
				lastCleanup: new Date(),
			},
			update: {
				retentionDays,
				lastCleanup: new Date(),
			},
		});

		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

		switch (dataType) {
			case "pageview":
				await this.db.pageView.deleteMany({
					where: { timestamp: { lt: cutoffDate } },
				});
				break;
			case "event":
				await this.db.eventLog.deleteMany({
					where: { timestamp: { lt: cutoffDate } },
				});
				break;
			case "metrics":
				await this.db.aggregateMetrics.deleteMany({
					where: { endTime: { lt: cutoffDate } },
				});
				break;
		}
	}

	// ─── ADMIN READ METHODS ──────────────────────────────────────────────────

	/** List retention policies with pagination */
	async listDataRetention(skip = 0, take = 10) {
		return this.db.dataRetentionPolicy.findMany({
			skip,
			take,
			orderBy: { dataType: "asc" },
		});
	}

	/** Fetch aggregate metrics with optional filters */
	async getAggregateMetrics(params: {
		metricType?: string;
		period?: string;
		startTime?: Date;
		endTime?: Date;
	}) {
		const where: Prisma.AggregateMetricsWhereInput = {};
		if (params.metricType) where.metricType = params.metricType;
		if (params.period) where.period = params.period;
		if (params.startTime) where.startTime = params.startTime;
		if (params.endTime) where.endTime = params.endTime;

		return this.db.aggregateMetrics.findMany({
			where,
			orderBy: { startTime: "desc" },
		});
	}

	/** Fetch pageviews with pagination and optional path filter */
	async getPageViews(params: { skip: number; take: number; path?: string }) {
		const where: Prisma.PageViewWhereInput = {};
		if (params.path) where.path = params.path;

		const [data, total] = await Promise.all([
			this.db.pageView.findMany({
				where,
				skip: params.skip,
				take: params.take,
				orderBy: { timestamp: "desc" },
			}),
			this.db.pageView.count({ where }),
		]);

		return {
			data,
			total,
			totalPages: Math.ceil(total / params.take),
		};
	}

	/** Fetch events with pagination and optional filters */
	async getEvents(params: {
		skip: number;
		take: number;
		eventType?: string;
		path?: string;
	}) {
		const where: Prisma.EventLogWhereInput = {};
		if (params.eventType) where.eventType = params.eventType;
		if (params.path) where.path = params.path;

		const [data, total] = await Promise.all([
			this.db.eventLog.findMany({
				where,
				skip: params.skip,
				take: params.take,
				orderBy: { timestamp: "desc" },
			}),
			this.db.eventLog.count({ where }),
		]);

		return {
			data,
			total,
			totalPages: Math.ceil(total / params.take),
		};
	}
}
