# skit-fast-cli

🚀 Fast SvelteKit project starter with Coolify deployment integration

A powerful CLI tool that creates SvelteKit projects with modern tooling, Docker configuration, and optional Coolify deployment setup.

## Features

- ⚡ **SvelteKit** with TypeScript, ESLint, Prettier, and Tailwind CSS
- 🖥️ **Tauri** desktop and mobile app development (optional)
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
2. **Tauri integration**: Optional desktop/mobile app development with platform selection
3. **Coolify integration**: Optional deployment setup with URL and API token
4. **Database selection**: PocketBase or MongoDB
5. **Cache options**: Redis integration
6. **Additional services**: LiteLLM, Qdrant
7. **Docker registry**: For deployment configuration

## What it creates

- Complete SvelteKit project with TypeScript
- Optional Tauri setup for desktop and mobile apps
- Dockerfile and docker-compose.yml
- GitHub Actions workflows (disabled by default)
- Deployment scripts in package.json
- Environment file with Coolify variables
- Project documentation

## Requirements

- Node.js 16+
- Docker (for containerization)
- SvelteKit CLI (`@sveltejs/cli`) - installed automatically if needed
- Rust (for Tauri desktop apps, if selected)
- Android Studio & NDK (for Android apps, if selected)
- Xcode on macOS (for iOS apps, if selected)

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