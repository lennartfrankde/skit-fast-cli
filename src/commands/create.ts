import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { ProjectOptions } from '../types';
import { executeCommand, executeCommandAsync, getCurrentDirectoryName, writeTemplateFile } from '../utils/command';
import { CoolifyClient } from '../utils/coolify';

export async function createProject(): Promise<void> {
  console.log(chalk.blue.bold('🚀 SvelteKit Fast CLI'));
  console.log(chalk.gray('Creating a new SvelteKit project with modern tooling\n'));

  // Get project options through interactive prompts
  const options = await getProjectOptions();
  
  console.log(chalk.yellow('\n📋 Creating SvelteKit project...'));
  
  // Create SvelteKit project
  await createSvelteKitProject(options);
  
  // Set up Coolify deployment if requested
  if (options.useCoolify) {
    await setupCoolifyDeployment(options);
  }
  
  // Generate Docker files and scripts
  await generateProjectFiles(options);
  
  console.log(chalk.green.bold('\n✅ Project created successfully!'));
  console.log(chalk.cyan('Next steps:'));
  console.log(chalk.cyan('  1. cd ' + options.projectName));
  console.log(chalk.cyan('  2. npm install'));
  console.log(chalk.cyan('  3. npm run dev'));
  
  if (options.useCoolify) {
    console.log(chalk.cyan('  4. npm run deploy:prod # to deploy to production'));
    console.log(chalk.cyan('  5. npm run deploy:dev # to deploy to development'));
  }
}

async function getProjectOptions(): Promise<ProjectOptions> {
  const currentDir = getCurrentDirectoryName();
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: currentDir,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Project name is required';
        }
        if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
          return 'Project name should only contain letters, numbers, hyphens, and underscores';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'useCoolify',
      message: 'Do you want to set up Coolify deployment?',
      default: false
    },
    {
      type: 'input',
      name: 'coolifyUrl',
      message: 'Coolify URL:',
      when: (answers) => answers.useCoolify,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Coolify URL is required';
        }
        try {
          new URL(input);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    },
    {
      type: 'password',
      name: 'coolifyApiToken',
      message: 'Coolify API Token:',
      when: (answers) => answers.useCoolify,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'API token is required';
        }
        return true;
      }
    },
    {
      type: 'list',
      name: 'database',
      message: 'Choose a database:',
      choices: [
        { name: 'PocketBase', value: 'pocketbase' },
        { name: 'MongoDB', value: 'mongodb' }
      ],
      default: 'pocketbase'
    },
    {
      type: 'confirm',
      name: 'useRedis',
      message: 'Do you want to add Redis cache?',
      default: false
    },
    {
      type: 'checkbox',
      name: 'services',
      message: 'Select additional services:',
      choices: [
        { name: 'LiteLLM (AI Gateway)', value: 'litellm' },
        { name: 'Qdrant (Vector Database)', value: 'qdrant' }
      ],
      default: []
    },
    {
      type: 'input',
      name: 'dockerRegistry',
      message: 'Docker registry (optional):',
      when: (answers) => answers.useCoolify,
      default: 'ghcr.io'
    },
    {
      type: 'input',
      name: 'registryTag',
      message: 'Docker registry tag:',
      when: (answers) => answers.useCoolify && answers.dockerRegistry,
      default: (answers) => `${answers.dockerRegistry}/${answers.projectName}:latest`,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Registry tag is required';
        }
        return true;
      }
    }
  ]);

  return answers as ProjectOptions;
}

async function createSvelteKitProject(options: ProjectOptions): Promise<void> {
  try {
    // Create SvelteKit project with sv create
    console.log(chalk.blue('Creating SvelteKit project with sv create...'));
    
    // Check if the directory already exists
    if (await fs.pathExists(options.projectName)) {
      throw new Error(`Directory ${options.projectName} already exists`);
    }
    
    // For automation, we'll provide instructions and create a basic SvelteKit project structure
    // Since sv create is interactive, we'll provide clear instructions to the user
    console.log(chalk.yellow('\n📋 Please run the following command and select these options:'));
    console.log(chalk.cyan(`npx sv create ${options.projectName}`));
    console.log(chalk.yellow('\nWhen prompted, please select:'));
    console.log(chalk.yellow('- Which Svelte app template? → SvelteKit minimal'));
    console.log(chalk.yellow('- Add type checking with TypeScript? → Yes, using TypeScript syntax'));
    console.log(chalk.yellow('- Select additional options:'));
    console.log(chalk.yellow('  ✓ Add ESLint for code linting'));
    console.log(chalk.yellow('  ✓ Add Prettier for code formatting'));
    console.log(chalk.yellow('  ✓ Add Tailwind CSS for styling'));
    console.log(chalk.yellow('  ✓ Add Playwright for browser testing (optional)'));
    console.log(chalk.yellow('  ✓ Add Vitest for unit testing (optional)'));
    
    // Wait for user confirmation
    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Have you created the SvelteKit project with the options above?',
      default: false
    }]);
    
    if (!proceed) {
      throw new Error('SvelteKit project creation cancelled');
    }
    
    // Verify the project was created
    if (!await fs.pathExists(options.projectName)) {
      throw new Error(`Project directory ${options.projectName} not found. Please create the SvelteKit project first.`);
    }
    
    // Verify it's a SvelteKit project
    const packageJsonPath = path.join(options.projectName, 'package.json');
    if (!await fs.pathExists(packageJsonPath)) {
      throw new Error('Invalid SvelteKit project: package.json not found');
    }
    
    const packageJson = await fs.readJson(packageJsonPath);
    if (!packageJson.devDependencies || !packageJson.devDependencies['@sveltejs/kit']) {
      throw new Error('Invalid SvelteKit project: @sveltejs/kit not found in devDependencies');
    }
    
    console.log(chalk.green(`✓ SvelteKit project verified: ${options.projectName}`));
  } catch (error: any) {
    console.error(chalk.red('Failed to create SvelteKit project:'), error.message);
    throw error;
  }
}

async function setupCoolifyDeployment(options: ProjectOptions): Promise<void> {
  if (!options.coolifyUrl || !options.coolifyApiToken) {
    return;
  }

  console.log(chalk.blue('Setting up Coolify deployment...'));
  
  try {
    const coolify = new CoolifyClient(options.coolifyUrl, options.coolifyApiToken);
    
    // Test connection
    console.log(chalk.blue('Testing Coolify connection...'));
    const connected = await coolify.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Coolify API. Please check your URL and API token.');
    }
    console.log(chalk.green('✓ Connected to Coolify'));
    
    // Create project
    console.log(chalk.blue('Creating Coolify project...'));
    const project = await coolify.createProject(options.projectName);
    
    // Create SvelteKit service
    if (options.registryTag) {
      console.log(chalk.blue('Creating SvelteKit application service...'));
      await coolify.createSvelteKitService(project.id, 'app', options.registryTag);
    }
    
    // Create database service
    if (options.database === 'pocketbase') {
      console.log(chalk.blue('Creating PocketBase service...'));
      await coolify.createPocketBaseService(project.id);
    } else if (options.database === 'mongodb') {
      console.log(chalk.yellow('MongoDB service creation not implemented yet. Please add manually in Coolify.'));
    }
    
    // Create Redis service if requested
    if (options.useRedis) {
      console.log(chalk.blue('Creating Redis service...'));
      await coolify.createRedisService(project.id);
    }
    
    // Create additional services
    if (options.services.includes('litellm')) {
      console.log(chalk.blue('Creating LiteLLM service...'));
      await coolify.createLiteLLMService(project.id);
    }
    
    if (options.services.includes('qdrant')) {
      console.log(chalk.yellow('Qdrant service creation not implemented yet. Please add manually in Coolify.'));
    }
    
    // Get environment variables and create .env file
    console.log(chalk.blue('Retrieving environment variables...'));
    const envVars = await coolify.getEnvironmentVariables(project.id);
    await createEnvironmentFile(options.projectName, envVars, options.coolifyUrl);
    
    console.log(chalk.green('✅ Coolify deployment setup completed!'));
    console.log(chalk.cyan(`🌐 Project URL: ${options.coolifyUrl}/projects/${project.id}`));
    
  } catch (error: any) {
    console.error(chalk.red('Failed to set up Coolify deployment:'), error.message);
    console.log(chalk.yellow('You can set up Coolify deployment manually later.'));
    console.log(chalk.yellow('The project files will still be generated with Docker support.'));
    
    // Don't throw the error - continue with local project setup
  }
}

async function createEnvironmentFile(projectName: string, envVars: Record<string, string>, coolifyUrl?: string): Promise<void> {
  const envPath = path.join(process.cwd(), projectName, '.env');
  
  // Create base environment variables with sensible defaults
  const baseEnvVars: Record<string, string> = {
    NODE_ENV: 'development',
    PORT: '3000',
    ...envVars
  };
  
  // Add Coolify-specific environment variables if URL is provided
  if (coolifyUrl) {
    baseEnvVars.COOLIFY_URL = coolifyUrl;
  }
  
  const envContent = [
    '# Environment Variables',
    '# Generated by skit-fast-cli',
    '',
    '# Application',
    ...Object.entries(baseEnvVars)
      .filter(([key]) => ['NODE_ENV', 'PORT'].includes(key))
      .map(([key, value]) => `${key}=${value}`),
    '',
    '# Database',
    '# DATABASE_URL=your_database_url_here',
    '',
    '# Redis (if enabled)',
    '# REDIS_URL=redis://localhost:6379',
    '',
    '# Coolify Environment Variables'
  ];
  
  // Add Coolify environment variables
  Object.entries(baseEnvVars)
    .filter(([key]) => !['NODE_ENV', 'PORT'].includes(key))
    .forEach(([key, value]) => {
      envContent.push(`${key}=${value}`);
    });
  
  // Add example variables if no Coolify vars are available
  if (Object.keys(envVars).length === 0) {
    envContent.push('# Add your environment variables here');
    envContent.push('# EXAMPLE_VAR=example_value');
  }
    
  await fs.writeFile(envPath, envContent.join('\n'));
  console.log(chalk.green(`✓ Created .env file with ${Object.keys(baseEnvVars).length} variables`));
}

async function generateProjectFiles(options: ProjectOptions): Promise<void> {
  console.log(chalk.blue('Generating project files...'));
  
  const projectPath = path.join(process.cwd(), options.projectName);
  
  // Ensure project directory exists
  if (!await fs.pathExists(projectPath)) {
    throw new Error(`Project directory ${projectPath} does not exist`);
  }
  
  try {
    // Create Dockerfile
    await createDockerfile(projectPath, options);
    
    // Create docker-compose.yml for development
    await createDockerCompose(projectPath, options);
    
    // Create deployment scripts
    await createDeploymentScripts(projectPath, options);
    
    // Create GitHub Actions (disabled by default)
    await createGitHubActions(projectPath, options);
    
    // Copy and generate additional project files
    await copyProjectTemplates(projectPath, options);
    
    console.log(chalk.green('✅ All project files generated successfully!'));
  } catch (error: any) {
    console.error(chalk.red('Error generating project files:'), error.message);
    throw error;
  }
}

async function copyProjectTemplates(projectPath: string, options: ProjectOptions): Promise<void> {
  const templatesDir = path.join(__dirname, '..', 'templates');
  
  try {
    // Copy .gitignore if it doesn't exist
    const gitignorePath = path.join(projectPath, '.gitignore');
    if (!await fs.pathExists(gitignorePath)) {
      const templateGitignore = path.join(templatesDir, '.gitignore');
      if (await fs.pathExists(templateGitignore)) {
        await fs.copy(templateGitignore, gitignorePath);
        console.log(chalk.green('✓ Created .gitignore'));
      }
    }
    
    // Copy LiteLLM config if LiteLLM is selected
    if (options.services.includes('litellm')) {
      const litellmConfigPath = path.join(projectPath, 'litellm-config.yaml');
      const templateLitellmConfig = path.join(templatesDir, 'litellm-config.yaml');
      if (await fs.pathExists(templateLitellmConfig)) {
        await fs.copy(templateLitellmConfig, litellmConfigPath);
        console.log(chalk.green('✓ Created litellm-config.yaml'));
      }
    }
    
    // Copy Redis compose if Redis is selected
    if (options.useRedis) {
      const redisComposePath = path.join(projectPath, 'redis-compose.yml');
      const templateRedisCompose = path.join(templatesDir, 'redis-compose.yml');
      if (await fs.pathExists(templateRedisCompose)) {
        await fs.copy(templateRedisCompose, redisComposePath);
        console.log(chalk.green('✓ Created redis-compose.yml'));
      }
    }
    
    // Generate README.md with project-specific content
    await createProjectReadme(projectPath, options);
    
  } catch (error: any) {
    console.log(chalk.yellow('Warning: Could not copy all template files:'), error.message);
  }
}

async function createProjectReadme(projectPath: string, options: ProjectOptions): Promise<void> {
  const readmePath = path.join(projectPath, 'README.md');
  
  const readmeContent = `# ${options.projectName}

A fast SvelteKit project created with skit-fast-cli.

## Features

- ⚡ SvelteKit with TypeScript
- 🎨 Tailwind CSS with all features enabled
- 📝 ESLint and Prettier configured
- 🐳 Docker ready${options.useCoolify ? '\n- 🚀 Coolify deployment configured' : ''}${options.database ? `\n- 🗄️ ${options.database.charAt(0).toUpperCase() + options.database.slice(1)} database integration` : ''}${options.useRedis ? '\n- 🔴 Redis cache integration' : ''}

## Development

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
\`\`\`

## Docker

\`\`\`bash
# Build Docker image
npm run docker:build

# Run with docker-compose
docker-compose up
\`\`\`
${options.useCoolify ? `
## Deployment

### Production
\`\`\`bash
npm run deploy:prod
\`\`\`

### Development
\`\`\`bash
npm run deploy:dev
\`\`\`

### Environment Variables

Set the following environment variables for deployment:
- \`COOLIFY_WEBHOOK_URL\` - Webhook URL for production deployment
- \`COOLIFY_DEV_WEBHOOK_URL\` - Webhook URL for development deployment
` : ''}
## Services
${options.database ? `
- **Database**: ${options.database}` : ''}${options.useRedis ? `
- **Cache**: Redis` : ''}${options.services.length > 0 ? `
${options.services.map(service => `- **${service}**: Additional service`).join('\n')}` : ''}

## GitHub Actions

GitHub Actions workflows are included but disabled by default. To enable:

1. Set up repository secrets:
   - \`DOCKER_REGISTRY\`
   - \`DOCKER_USERNAME\` 
   - \`DOCKER_PASSWORD\`${options.useCoolify ? `
   - \`COOLIFY_WEBHOOK_URL\`
   - \`COOLIFY_DEV_WEBHOOK_URL\`` : ''}

2. Edit \`.github/workflows/*.yml\` and change \`if: false\` to \`if: true\`

## License

MIT
`;

  await fs.writeFile(readmePath, readmeContent);
  console.log(chalk.green('✓ Created README.md'));
}

async function createDockerfile(projectPath: string, options: ProjectOptions): Promise<void> {
  const dockerfileContent = `# Use Node.js 18 Alpine as base image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production image
FROM node:18-alpine AS runner

WORKDIR /app

# Copy built app
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "build"]
`;

  await fs.writeFile(path.join(projectPath, 'Dockerfile'), dockerfileContent);
  console.log(chalk.green('✓ Created Dockerfile'));
}

async function createDockerCompose(projectPath: string, options: ProjectOptions): Promise<void> {
  let services = `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    depends_on:`;

  const dependencies: string[] = [];

  if (options.database === 'pocketbase') {
    dependencies.push('pocketbase');
    services += `
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    ports:
      - "8090:8090"
    volumes:
      - pocketbase_data:/pb_data`;
  }

  if (options.useRedis) {
    dependencies.push('redis');
    services += `
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"`;
  }

  if (dependencies.length > 0) {
    services += '\n      - ' + dependencies.join('\n      - ');
  }

  services += '\n\nvolumes:';
  if (options.database === 'pocketbase') {
    services += '\n  pocketbase_data:';
  }

  await fs.writeFile(path.join(projectPath, 'docker-compose.yml'), services);
  console.log(chalk.green('✓ Created docker-compose.yml'));
}

async function createDeploymentScripts(projectPath: string, options: ProjectOptions): Promise<void> {
  // Create package.json scripts
  const packageJsonPath = path.join(projectPath, 'package.json');
  
  if (await fs.pathExists(packageJsonPath)) {
    const packageJson = await fs.readJson(packageJsonPath);
    
    packageJson.scripts = {
      ...packageJson.scripts,
      'docker:build': `docker build -t ${options.registryTag || options.projectName} .`,
      'deploy:prod': 'npm run docker:build && docker push && curl -X POST $COOLIFY_WEBHOOK_URL',
      'deploy:dev': 'npm run docker:build && docker push && curl -X POST $COOLIFY_DEV_WEBHOOK_URL'
    };
    
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    console.log(chalk.green('✓ Added deployment scripts to package.json'));
  }
}

async function createGitHubActions(projectPath: string, options: ProjectOptions): Promise<void> {
  const actionsDir = path.join(projectPath, '.github', 'workflows');
  await fs.ensureDir(actionsDir);
  
  const prodWorkflow = `name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: false # Disabled by default
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        
      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ secrets.DOCKER_REGISTRY }}
          username: \${{ secrets.DOCKER_USERNAME }}
          password: \${{ secrets.DOCKER_PASSWORD }}
          
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${options.registryTag || options.projectName}
          
      - name: Deploy to Coolify
        run: |
          curl -X POST "\${{ secrets.COOLIFY_WEBHOOK_URL }}"
`;

  const devWorkflow = `name: Deploy to Development

on:
  push:
    branches: [develop, dev]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: false # Disabled by default
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        
      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ secrets.DOCKER_REGISTRY }}
          username: \${{ secrets.DOCKER_USERNAME }}
          password: \${{ secrets.DOCKER_PASSWORD }}
          
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${options.registryTag?.replace(':latest', ':dev') || options.projectName + ':dev'}
          
      - name: Deploy to Coolify Dev
        run: |
          curl -X POST "\${{ secrets.COOLIFY_DEV_WEBHOOK_URL }}"
`;

  await fs.writeFile(path.join(actionsDir, 'deploy-prod.yml'), prodWorkflow);
  await fs.writeFile(path.join(actionsDir, 'deploy-dev.yml'), devWorkflow);
  
  console.log(chalk.green('✓ Created GitHub Actions workflows (disabled by default)'));
}