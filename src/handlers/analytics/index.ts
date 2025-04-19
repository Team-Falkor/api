import { prisma, type Prisma } from "../../utils/prisma";
import { SimpleUAParser } from "../../utils/ua-parser";
import { isValidUUID, generateUUID as uuidv4 } from "../../utils/uuid";

export class AnalyticsHandler {
  private db = prisma;

  async recordPageView(data: {
    path: string;
    userAgent?: string;
    countryCode?: string;
    sessionId: string;
  }): Promise<void> {
    // Validate sessionId format
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
    // Validate sessionId format
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
    retentionDays: number
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
}
