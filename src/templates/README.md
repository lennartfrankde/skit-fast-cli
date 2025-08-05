# {{ projectName }}

A fast SvelteKit project created with skit-fast-cli.

## Features

- ⚡ SvelteKit with TypeScript
- 🎨 Tailwind CSS with all features enabled
- 📝 ESLint and Prettier configured
- 🐳 Docker ready
{{#if useCoolify}}
- 🚀 Coolify deployment configured
{{/if}}
{{#if database}}
- 🗄️ {{ database }} database integration
{{/if}}
{{#if useRedis}}
- 🔴 Redis cache integration
{{/if}}

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Docker

```bash
# Build Docker image
npm run docker:build

# Run with docker-compose
docker-compose up
```

{{#if useCoolify}}
## Deployment

### Production
```bash
npm run deploy:prod
```

### Development
```bash
npm run deploy:dev
```

### Environment Variables

Set the following environment variables for deployment:
- `COOLIFY_WEBHOOK_URL` - Webhook URL for production deployment
- `COOLIFY_DEV_WEBHOOK_URL` - Webhook URL for development deployment

{{/if}}

## Services

{{#if database}}
- **Database**: {{ database }}
{{/if}}
{{#if useRedis}}
- **Cache**: Redis
{{/if}}
{{#each services}}
- **{{ this }}**: Additional service
{{/each}}

## GitHub Actions

GitHub Actions workflows are included but disabled by default. To enable:

1. Set up repository secrets:
   - `DOCKER_REGISTRY`
   - `DOCKER_USERNAME` 
   - `DOCKER_PASSWORD`
   {{#if useCoolify}}
   - `COOLIFY_WEBHOOK_URL`
   - `COOLIFY_DEV_WEBHOOK_URL`
   {{/if}}

2. Edit `.github/workflows/*.yml` and change `if: false` to `if: true`

## License

MIT