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
    
    // Use sv create to create the project (assumes sv is installed globally)
    const svCommand = `npx sv create ${options.projectName}`;
    
    // For automation, we'll need to handle the interactive prompts
    // This is a simplified version - in reality, sv create is interactive
    console.log(chalk.yellow('Note: sv create will prompt for options. Please select:'));
    console.log(chalk.yellow('- TypeScript: Yes'));
    console.log(chalk.yellow('- ESLint: Yes'));
    console.log(chalk.yellow('- Prettier: Yes'));
    console.log(chalk.yellow('- Tailwind CSS: Yes (with all features)'));
    
    await executeCommandAsync('npx', ['sv', 'create', options.projectName], {});
    
    console.log(chalk.green(`✓ SvelteKit project created: ${options.projectName}`));
  } catch (error: any) {
    console.error(chalk.red('Failed to create SvelteKit project'));
    console.error(chalk.red('Make sure you have sv installed: npm install -g @sveltejs/cli'));
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
    const connected = await coolify.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Coolify');
    }
    
    // Create project
    const project = await coolify.createProject(options.projectName);
    
    // Create SvelteKit service
    if (options.registryTag) {
      await coolify.createSvelteKitService(project.id, 'app', options.registryTag);
    }
    
    // Create database service
    if (options.database === 'pocketbase') {
      await coolify.createPocketBaseService(project.id);
    }
    
    // Create Redis service if requested
    if (options.useRedis) {
      await coolify.createRedisService(project.id);
    }
    
    // Create additional services
    if (options.services.includes('litellm')) {
      await coolify.createLiteLLMService(project.id);
    }
    
    // Get environment variables and create .env file
    const envVars = await coolify.getEnvironmentVariables(project.id);
    await createEnvironmentFile(options.projectName, envVars);
    
  } catch (error: any) {
    console.error(chalk.red('Failed to set up Coolify deployment:'), error.message);
    console.log(chalk.yellow('You can set up Coolify manually later.'));
  }
}

async function createEnvironmentFile(projectName: string, envVars: Record<string, string>): Promise<void> {
  const envPath = path.join(process.cwd(), projectName, '.env');
  const envContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
    
  await fs.writeFile(envPath, envContent);
  console.log(chalk.green(`✓ Created .env file with ${Object.keys(envVars).length} variables`));
}

async function generateProjectFiles(options: ProjectOptions): Promise<void> {
  console.log(chalk.blue('Generating project files...'));
  
  const projectPath = path.join(process.cwd(), options.projectName);
  
  // Create Dockerfile
  await createDockerfile(projectPath, options);
  
  // Create docker-compose.yml for development
  await createDockerCompose(projectPath, options);
  
  // Create deployment scripts
  await createDeploymentScripts(projectPath, options);
  
  // Create GitHub Actions (disabled by default)
  await createGitHubActions(projectPath, options);
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