# skit-fast-cli

🚀 Fast SvelteKit project starter with Coolify deployment integration

A powerful CLI tool that creates SvelteKit projects with modern tooling, Docker configuration, and optional Coolify deployment setup.

## Features

- ⚡ **SvelteKit** with TypeScript, ESLint, Prettier, and Tailwind CSS
- 🐳 **Docker** ready with multi-stage builds
- 🌊 **Coolify** deployment integration
- 🗄️ **Database options**: PocketBase or MongoDB
- 🔴 **Redis** cache support
- 🤖 **AI Services**: LiteLLM and Qdrant integration
- 🚀 **GitHub Actions** workflows (deployable to prod/dev)
- 📝 **Environment management** with Coolify integration

## Installation

```bash
npm install -g skit-fast-cli
```

Or run directly with npx:

```bash
npx skit-fast-cli
```

## Usage

```bash
# Create a new project interactively
skit-fast

# Or use the create command explicitly
skit-fast create
```

The CLI will guide you through:

1. **Project setup**: Name, directory selection
2. **Coolify integration**: Optional deployment setup with URL and API token
3. **Database selection**: PocketBase or MongoDB
4. **Cache options**: Redis integration
5. **Additional services**: LiteLLM, Qdrant
6. **Docker registry**: For deployment configuration

## What it creates

- Complete SvelteKit project with TypeScript
- Dockerfile and docker-compose.yml
- GitHub Actions workflows (disabled by default)
- Deployment scripts in package.json
- Environment file with Coolify variables
- Project documentation

## Requirements

- Node.js 16+
- Docker (for containerization)
- SvelteKit CLI (`@sveltejs/cli`) - installed automatically if needed

## Development

```bash
# Clone the repository
git clone <repo-url>
cd skit-fast-cli

# Install dependencies
npm install

# Build the project
npm run build

# Test locally
npm run dev

# Link for global testing
npm link
```

## License

MIT