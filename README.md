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
DATABASE_URL="file:../data.db"
JWT_SECRET="your-secret-key-at-least-32-characters-long"
```

> **Note**: Make sure your JWT_SECRET is at least 32 characters long for security.

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

The API uses JWT for authentication. Here's how to authenticate:

1. Register a new user: `POST /auth/sign-up`
2. Login to get tokens: `POST /auth/login`
3. Use the access token in subsequent requests
4. Refresh tokens when needed: `POST /auth/refresh`
5. Logout: `POST /auth/logout`

## 🛣️ API Endpoints

### Authentication

- `POST /auth/sign-up` - Register a new user
- `POST /auth/login` - Login and get tokens
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout and invalidate tokens
- `GET /auth/me` - Get current user info

### Achievements

- `GET /achievements/steam` - Get Steam achievements

### Plugins

- `GET /plugins/providers` - Get available providers

## 🧰 Project Structure

```
api-elysia/
├── prisma/              # Database schema and migrations
├── src/
│   ├── @types/          # TypeScript type definitions
│   ├── handlers/        # Request handlers
│   ├── routes/          # API routes
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
- [@elysiajs/jwt](https://elysiajs.com/plugins/jwt.html) - JWT authentication
- [@elysiajs/cors](https://elysiajs.com/plugins/cors.html) - CORS support

## 📝 License

This project is licensed under the terms of the license included in the repository.
