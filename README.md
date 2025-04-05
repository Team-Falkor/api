# Falkor API

A TypeScript-based API service with built-in rate limiting, provider management, and security features.

## Features

- Provider management with CRUD operations
- Built-in rate limiting and security measures
- Audit logging system
- SQLite database integration
- TypeScript support

## Prerequisites

- [Bun Runtime](https://bun.sh) (Latest version)
- Node.js 18+ (Alternative runtime)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000                    # Default port for the API server
DBName=db.sqlite             # SQLite database filename

# Security Configuration
IP_SECRET_KEY=your-secret    # Secret key for IP hashing (min 16 chars)
LOG_LEVEL=info               # Logging level (debug|info|warn|error)
SECURITY_LOG_FILE=           # Optional: Path to security log file

# Environment
NODE_ENV=production          # Environment (development|production)
```

## Development

Start the development server with hot reload:

```bash
bun run dev
```

## Production Deployment

1. Set up environment variables (see Configuration section)
2. Build and start the server:
   ```bash
   bun run start
   ```

## Security Considerations

- Always change the default `IP_SECRET_KEY` in production
- Set appropriate rate limits in `src/handlers/ratelimit/index.ts`
- Keep the SQLite database in a secure location
- Regularly monitor audit logs

## API Endpoints

### Providers

- `GET /providers` - List all providers
- `GET /providers/:id` - Get provider by ID
- `POST /providers` - Add new provider
- `PUT /providers/:id` - Update provider
- `DELETE /providers/:id` - Delete provider

### Rate Limiting

Default configuration:
- 10 requests per minute per endpoint
- 10-minute block duration after limit exceeded
- Suspicious activity monitoring after 5 failed attempts

## Database

The API uses SQLite with the following tables:
- `providers`: Store provider information
- `rate_limits`: Track API usage and blocks
- `audit_log`: Security and operation logging

## Monitoring

- Check application logs for operational status
- Monitor the audit log for security events
- Review rate limit blocks and suspicious activities

## License

See [LICENSE](LICENSE) file for details.