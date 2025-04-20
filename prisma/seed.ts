import { Phase, PrismaClient, Role, Status } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot seed in production environment");
  }

  // Seeding users
  const hashedPassword = await bcrypt.hash("password123", 10);

  // Delete existing users and create new ones
  await prisma.user.deleteMany();

  // Create admin user
  await prisma.user.create({
    data: {
      email: "admin@example.com",
      username: "testinggggg",
      password: hashedPassword,
      role: Role.ADMIN,
      emailVerified: true,
      lastLogin: new Date(),
    },
  });

  // Create regular user
  await prisma.user.create({
    data: {
      email: "user@example.com",
      username: "user",
      password: hashedPassword,
      role: Role.USER,
      emailVerified: true,
      lastLogin: new Date(),
    },
  });

  // delete existing roadmap events
  await prisma.roadmapEvent.deleteMany();

  // Seeding Roadmap Events
  await prisma.roadmapEvent.create({
    data: {
      phase: Phase.PRE_LAUNCH,
      status: Status.PLANNED,
      items: {
        create: [
          {
            title: "Initial Design",
            completed: false,
            category: "UI/UX",
          },
          {
            title: "Setup Backend",
            completed: false,
            category: "Backend",
          },
        ],
      },
    },
  });

  // delete existing roadmap events
  await prisma.roadmapEvent.deleteMany();

  // Seeding Roadmap Events
  await prisma.roadmapEvent.create({
    data: {
      phase: Phase.LAUNCH,
      status: Status.IN_PROGRESS,
      items: {
        create: [
          {
            title: "Marketing Campaign",
            completed: false,
            category: "Marketing",
          },
          {
            title: "Finalize Features",
            completed: false,
            category: "Development",
          },
        ],
      },
    },
  });

  // delete existing page views
  await prisma.pageView.deleteMany();

  // Seeding Analytics (Page Views, Event Logs, etc.)
  await prisma.pageView.create({
    data: {
      path: "/home",
      sessionId: "sample-session-id",
      deviceType: "desktop",
      browser: "Chrome",
      country: "US",
    },
  });

  // delete existing event logs
  await prisma.eventLog.deleteMany();

  // Seeding Event Logs
  await prisma.eventLog.create({
    data: {
      eventType: "Page View",
      sessionId: "sample-session-id",
      path: "/home",
      timestamp: new Date(),
    },
  });

  // delete existing data retention policies
  await prisma.dataRetentionPolicy.deleteMany();

  // Seeding Data Retention Policy
  await prisma.dataRetentionPolicy.create({
    data: {
      dataType: "PageView",
      retentionDays: 30,
      anonymizationRequired: true,
    },
  });

  // delete existing health check states
  await prisma.healthCheckState.deleteMany();

  // Seeding HealthCheckState
  await prisma.healthCheckState.create({
    data: {
      lastCheckCompletionTime: new Date(),
      wasLastCheckSuccessful: true,
    },
  });

  console.log("Database has been seeded!");
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
