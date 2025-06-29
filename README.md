<div align="center">
 <img alt="falkor" height="150px" src="https://raw.githubusercontent.com/Team-Falkor/falkor/refs/heads/testing/public/icon.png">
</div>

# Falkor API

This is the backend API for the Falkor project, built with [Elysia](https://elysiajs.com/) and [Bun](https://bun.sh) runtime.

## 📋 Prerequisites

- [Bun](https://bun.sh) (v1.0.0 or higher)

## 🚀 Getting Started

### Installation

1. Clone the repository

```bash
git clone https://github.com/team-falkor/api.git
cd api
```

2. Install dependencies

```bash
bun install
```

3. Set up environment variables

Create a `.env` file in the root directory with the following variables:

```
DATABASE_URL="file:./prisma/dev.db"
BETTER_AUTH_SECRET="your-secret-key-at-least-32-characters-long"
STEAM_API_KEY="your-steam-api-key"
```

> **Note**: Make sure your BETTER_AUTH_SECRET is at least 32 characters long for security. Get your Steam API key from [Steam Web API](https://steamcommunity.com/dev/apikey).

4. Set up the database

```bash
bun run db:push
```

## 🏃‍♂️ Development

To start the development server with hot reloading:

```bash
bun run dev
```

The API will be available at http://localhost:3000/

## 🚢 Production

To start the production server:

```bash
bun run start
```

## 📊 Database Management

- Pull the latest database schema: `bun run db:pull`
- Push schema changes to the database: `bun run db:push`

## 🔑 Authentication

The API uses [Better-auth](https://better-auth.com/) for authentication. Authentication endpoints are available under `/auth/*`.

## 🛣️ API Endpoints

### Authentication

- All authentication endpoints are handled by Better-auth under `/auth/*`

### Steam

- `GET /steam/user/:steamUserId/games` - Get user's Steam games

### Achievements

- `GET /achievements/:steamId` - Get Steam game schema for achievements
- `GET /achievements/user/:steamUserId/game/:appId` - Get player achievements for a specific game

### Providers

- `GET /providers` - Get available providers
- `PUT /providers` - Submit a new provider
- Admin routes available under `/providers/admin/*`

### Analytics

- `POST /analytics/pageview` - Record a page view
- `POST /analytics/event` - Record an event
- Admin routes available under `/analytics/admin/*`

### Roadmap

- `GET /roadmap` - Get roadmap events
- Admin routes available under `/roadmap/admin/*`

### Documentation

- `GET /docs` - Swagger API documentation

## 🧰 Project Structure

```
api-new/
├── prisma/              # Database schema and migrations
├── src/
│   ├── @types/          # TypeScript type definitions
│   ├── handlers/        # Business logic handlers
│   ├── helpers/         # Helper functions and utilities
│   ├── lib/             # Library configurations (auth, etc.)
│   ├── modules/         # Feature modules
│   │   ├── achievement/ # Steam achievements
│   │   ├── analytics/   # Analytics tracking
│   │   ├── plugins/     # Plugin providers
│   │   ├── roadmap/     # Roadmap management
│   │   └── steam/       # Steam API integration
│   ├── plugins/         # Elysia plugins
│   ├── utils/           # Utility functions
│   └── index.ts         # Main application entry point
├── .env                 # Environment variables (create this)
├── package.json         # Project dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## 🔧 Technologies Used

- [Bun](https://bun.sh) - JavaScript runtime & package manager
- [Elysia](https://elysiajs.com/) - TypeScript web framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [SQLite](https://www.sqlite.org/) - Database
- [Better-auth](https://better-auth.com/) - Authentication
- [@elysiajs/cors](https://elysiajs.com/plugins/cors.html) - CORS support

## 📝 License

This project is licensed under the terms of the license included in the repository.

# ❤️

Reminder that <strong><i>you are great, you are enough, and your presence is valued.</i></strong> If you are struggling with your mental health, please reach out to someone you love and consult a professional. You are not alone; there is a large range of resources online for support and guidance.
