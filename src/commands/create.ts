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
  
  // Set up Tauri if requested
  if (options.useTauri) {
    await setupTauriIntegration(options);
  }
  
  // Set up Coolify deployment if requested
  if (options.useCoolify) {
    await setupCoolifyDeployment(options);
  }
  
  // Generate Docker files and scripts
  await generateProjectFiles(options);
  
  console.log(chalk.green.bold('\n✅ Project created successfully!'));
  console.log(chalk.cyan('Next steps:'));
  if (!options.createInCurrentDir) {
    console.log(chalk.cyan('  1. cd ' + options.projectName));
    console.log(chalk.cyan('  2. npm install'));
    console.log(chalk.cyan('  3. npm run dev'));
  } else {
    console.log(chalk.cyan('  1. npm install'));
    console.log(chalk.cyan('  2. npm run dev'));
  }
  
  if (options.useTauri) {
    const nextStep = options.createInCurrentDir ? '3' : '4';
    console.log(chalk.cyan(`  ${nextStep}. npm run tauri dev # to run the desktop app`));
    if (options.tauriPlatforms.includes('android')) {
      console.log(chalk.cyan(`  ${parseInt(nextStep) + 1}. npm run tauri android dev # to run on Android`));
    }
  }
  
  if (options.useCoolify) {
    const step = options.useTauri ? (options.createInCurrentDir ? '5' : '6') : (options.createInCurrentDir ? '3' : '4');
    console.log(chalk.cyan(`  ${step}. npm run deploy:prod # to deploy to production`));
    console.log(chalk.cyan(`  ${parseInt(step) + 1}. npm run deploy:dev # to deploy to development`));
  }
}

async function getProjectOptions(): Promise<ProjectOptions> {
  const currentDir = getCurrentDirectoryName();
  
  // Get basic project options first
  const basicAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name (leave empty or use "." for current directory):',
      default: '',
      validate: (input: string) => {
        if (input.trim() === '' || input.trim() === '.') {
          return true; // Allow empty or "." for current directory
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
    }
  ]);
  
  // Get Coolify-specific options if needed
  let coolifyAnswers: any = {};
  if (basicAnswers.useCoolify) {
    coolifyAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'coolifyUrl',
        message: 'Coolify URL:',
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
        validate: (input: string) => {
          if (!input.trim()) {
            return 'API token is required';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'dockerRegistry',
        message: 'Docker registry (optional):',
        default: 'ghcr.io'
      }
    ]);
    
    if (coolifyAnswers.dockerRegistry) {
      const registryAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'registryTag',
          message: 'Docker registry tag (will be converted to lowercase):',
          default: `${coolifyAnswers.dockerRegistry}/${basicAnswers.projectName.toLowerCase()}:latest`,
          validate: (input: string) => {
            if (!input.trim()) {
              return 'Registry tag is required';
            }
            return true;
          }
        }
      ]);
      coolifyAnswers.registryTag = registryAnswer.registryTag.toLowerCase();
    }
  }
  
  // Get database and service options
  const serviceAnswers = await inquirer.prompt([
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
    }
  ]);
  
  // Get Tauri options
  const tauriAnswers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useTauri',
      message: 'Do you want to add Tauri for desktop/mobile app development?',
      default: false
    }
  ]);
  
  let tauriPlatforms: string[] = [];
  if (tauriAnswers.useTauri) {
    const platformAnswers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'tauriPlatforms',
        message: 'Select target platforms for Tauri:',
        choices: [
          { name: 'Desktop (Windows, macOS, Linux)', value: 'desktop' },
          { name: 'Android', value: 'android' },
          { name: 'iOS', value: 'ios' }
        ],
        default: ['desktop'],
        validate: (input: string[]) => {
          if (input.length === 0) {
            return 'Please select at least one platform';
          }
          return true;
        }
      }
    ] as any);
    tauriPlatforms = platformAnswers.tauriPlatforms;
  }

  return {
    ...basicAnswers,
    ...coolifyAnswers,
    ...serviceAnswers,
    useTauri: tauriAnswers.useTauri,
    tauriPlatforms,
    // Normalize project name: use current dir name if empty or "."
    projectName: (basicAnswers.projectName.trim() === '' || basicAnswers.projectName.trim() === '.') 
      ? currentDir 
      : basicAnswers.projectName.trim(),
    // Flag to indicate if creating in current directory
    createInCurrentDir: basicAnswers.projectName.trim() === '' || basicAnswers.projectName.trim() === '.'
  } as ProjectOptions;
}

async function setupTauriIntegration(options: ProjectOptions): Promise<void> {
  console.log(chalk.blue('Setting up Tauri integration...'));
  
  const projectPath = options.createInCurrentDir ? process.cwd() : path.join(process.cwd(), options.projectName);
  
  try {
    // Navigate to project directory for Tauri commands
    const originalCwd = process.cwd();
    if (!options.createInCurrentDir) {
      process.chdir(projectPath);
    }
    
    // Install Tauri CLI and dependencies
    console.log(chalk.blue('Installing Tauri dependencies...'));
    await executeCommand('npm install --save-dev @tauri-apps/cli');
    await executeCommand('npm install @tauri-apps/api');
    
    // Initialize Tauri
    console.log(chalk.blue('Initializing Tauri...'));
    await executeCommand('npx tauri init --yes');
    
    // Set up Android if selected
    if (options.tauriPlatforms.includes('android')) {
      console.log(chalk.blue('Setting up Android platform...'));
      try {
        await executeCommand('npx tauri android init');
        console.log(chalk.green('✓ Android platform initialized'));
      } catch (error: any) {
        console.log(chalk.yellow('⚠️ Android setup requires additional dependencies. Please run:'));
        console.log(chalk.yellow('  npx tauri android init'));
        console.log(chalk.yellow('after installing Android Studio and NDK.'));
      }
    }
    
    // Note about iOS setup (requires macOS)
    if (options.tauriPlatforms.includes('ios')) {
      console.log(chalk.yellow('⚠️ iOS setup requires macOS and Xcode. Please run:'));
      console.log(chalk.yellow('  npx tauri ios init'));
      console.log(chalk.yellow('on a macOS system with Xcode installed.'));
    }
    
    // Update package.json with Tauri scripts
    await updatePackageJsonWithTauriScripts(options);
    
    // Create Tauri configuration adjustments
    await createTauriConfigAdjustments(options);
    
    console.log(chalk.green('✅ Tauri integration completed!'));
    
    // Return to original directory if we changed
    if (!options.createInCurrentDir) {
      process.chdir(originalCwd);
    }
    
  } catch (error: any) {
    console.error(chalk.red('Failed to set up Tauri integration:'), error.message);
    console.log(chalk.yellow('You can set up Tauri manually later by running:'));
    console.log(chalk.yellow('  npm install --save-dev @tauri-apps/cli'));
    console.log(chalk.yellow('  npm install @tauri-apps/api'));
    console.log(chalk.yellow('  npx tauri init'));
    
    // Return to original directory if we changed
    if (!options.createInCurrentDir) {
      const originalCwd = process.cwd();
      process.chdir(originalCwd);
    }
  }
}

async function updatePackageJsonWithTauriScripts(options: ProjectOptions): Promise<void> {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  
  if (await fs.pathExists(packageJsonPath)) {
    const packageJson = await fs.readJson(packageJsonPath);
    
    // Add Tauri scripts
    packageJson.scripts = {
      ...packageJson.scripts,
      'tauri': 'tauri',
      'tauri:dev': 'tauri dev',
      'tauri:build': 'tauri build'
    };
    
    // Add platform-specific scripts
    if (options.tauriPlatforms.includes('android')) {
      packageJson.scripts['tauri:android:dev'] = 'tauri android dev';
      packageJson.scripts['tauri:android:build'] = 'tauri android build';
    }
    
    if (options.tauriPlatforms.includes('ios')) {
      packageJson.scripts['tauri:ios:dev'] = 'tauri ios dev';
      packageJson.scripts['tauri:ios:build'] = 'tauri ios build';
    }
    
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    console.log(chalk.green('✓ Added Tauri scripts to package.json'));
  }
}

async function createTauriConfigAdjustments(options: ProjectOptions): Promise<void> {
  const tauriConfigPath = path.join(process.cwd(), 'src-tauri', 'tauri.conf.json');
  
  if (await fs.pathExists(tauriConfigPath)) {
    try {
      const tauriConfig = await fs.readJson(tauriConfigPath);
      
      // Update app identifier
      if (tauriConfig.tauri && tauriConfig.tauri.bundle) {
        tauriConfig.tauri.bundle.identifier = `com.${options.projectName.toLowerCase().replace(/[^a-z0-9]/g, '')}.app`;
      }
      
      // Update build distDir to point to SvelteKit build
      if (tauriConfig.build) {
        tauriConfig.build.distDir = '../build';
        tauriConfig.build.devPath = 'http://localhost:5173';
      }
      
      await fs.writeJson(tauriConfigPath, tauriConfig, { spaces: 2 });
      console.log(chalk.green('✓ Updated Tauri configuration for SvelteKit'));
    } catch (error: any) {
      console.log(chalk.yellow('⚠️ Could not update Tauri configuration automatically'));
    }
  }
}

async function createSvelteKitProject(options: ProjectOptions): Promise<void> {
  try {
    // Create SvelteKit project with sv create
    console.log(chalk.blue('Creating SvelteKit project with sv create...'));
    
    const projectPath = options.createInCurrentDir ? '.' : options.projectName;
    
    // Check if we're creating in current directory and if it's not empty
    if (options.createInCurrentDir) {
      const currentDirFiles = await fs.readdir(process.cwd());
      const hasImportantFiles = currentDirFiles.some(file => 
        ['package.json', 'svelte.config.js', 'vite.config.js', 'src'].includes(file)
      );
      
      if (hasImportantFiles) {
        console.log(chalk.yellow('⚠️ Current directory contains existing project files. Creating SvelteKit project in current directory...'));
      }
    } else {
      // Check if the directory already exists
      if (await fs.pathExists(options.projectName)) {
        throw new Error(`Directory ${options.projectName} already exists`);
      }
    }
    
    // Execute sv create with automated options
    const svCreateArgs = options.createInCurrentDir 
      ? ['sv', 'create', '.', '--template', 'minimal', '--types', 'ts', '--no-add-ons', '--install', 'npm']
      : ['sv', 'create', options.projectName, '--template', 'minimal', '--types', 'ts', '--no-add-ons', '--install', 'npm'];
    
    console.log(chalk.blue(`Running: npx ${svCreateArgs.join(' ')}`));
    await executeCommandAsync('npx', svCreateArgs);
    
    // Verify the project was created
    const verifyPath = options.createInCurrentDir ? '.' : options.projectName;
    const packageJsonPath = options.createInCurrentDir 
      ? path.join(process.cwd(), 'package.json')
      : path.join(options.projectName, 'package.json');
    
    if (!await fs.pathExists(packageJsonPath)) {
      throw new Error('Invalid SvelteKit project: package.json not found');
    }
    
    const packageJson = await fs.readJson(packageJsonPath);
    if (!packageJson.devDependencies || !packageJson.devDependencies['@sveltejs/kit']) {
      throw new Error('Invalid SvelteKit project: @sveltejs/kit not found in devDependencies');
    }
    
    console.log(chalk.green(`✓ SvelteKit project created and verified: ${options.createInCurrentDir ? 'current directory' : options.projectName}`));
    
    // Add additional dependencies that we want
    await addAdditionalDependencies(options.createInCurrentDir ? '.' : options.projectName);
    
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
    
    // Test connection and verify credentials
    console.log(chalk.blue('Verifying Coolify credentials...'));
    const connected = await coolify.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Coolify API. Please check your URL and API token.');
    }
    console.log(chalk.green('✓ Coolify credentials verified successfully'));
    
    // Create project with lowercase name to avoid errors
    const projectName = options.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    console.log(chalk.blue(`Creating Coolify project: ${projectName}...`));
    const project = await coolify.createProject(projectName);
    
    // Create SvelteKit service with lowercase registry tag
    if (options.registryTag) {
      const lowercaseRegistryTag = options.registryTag.toLowerCase();
      console.log(chalk.blue('Creating SvelteKit application service...'));
      await coolify.createSvelteKitService(project.id, 'app', lowercaseRegistryTag);
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
    
    // Get environment variables and create .env file with verified credentials
    console.log(chalk.blue('Retrieving environment variables...'));
    const envVars = await coolify.getEnvironmentVariables(project.id);
    const projectDir = options.createInCurrentDir ? '.' : options.projectName;
    await createEnvironmentFile(projectDir, envVars, options.coolifyUrl, options.coolifyApiToken);
    
    console.log(chalk.green('✅ Coolify deployment setup completed!'));
    console.log(chalk.cyan(`🌐 Project URL: ${options.coolifyUrl}/projects/${project.id}`));
    
  } catch (error: any) {
    console.error(chalk.red('Failed to set up Coolify deployment:'), error.message);
    console.log(chalk.yellow('You can set up Coolify deployment manually later.'));
    console.log(chalk.yellow('The project files will still be generated with Docker support.'));
    
    // Still save credentials to .env even if Coolify setup fails
    if (options.coolifyUrl && options.coolifyApiToken) {
      const projectDir = options.createInCurrentDir ? '.' : options.projectName;
      await createEnvironmentFile(projectDir, {}, options.coolifyUrl, options.coolifyApiToken);
    }
  }
}

async function createEnvironmentFile(projectName: string, envVars: Record<string, string>, coolifyUrl?: string, coolifyApiToken?: string): Promise<void> {
  const envPath = projectName === '.' 
    ? path.join(process.cwd(), '.env')
    : path.join(process.cwd(), projectName, '.env');
  
  // Create base environment variables with sensible defaults
  const baseEnvVars: Record<string, string> = {
    NODE_ENV: 'development',
    PORT: '3000',
    ...envVars
  };
  
  // Add Coolify-specific environment variables if provided
  if (coolifyUrl) {
    baseEnvVars.COOLIFY_URL = coolifyUrl;
  }
  
  if (coolifyApiToken) {
    baseEnvVars.COOLIFY_API_TOKEN = coolifyApiToken;
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
    '# Coolify Configuration',
    ...Object.entries(baseEnvVars)
      .filter(([key]) => key.startsWith('COOLIFY_'))
      .map(([key, value]) => `${key}=${value}`),
    '',
    '# Database',
    '# DATABASE_URL=your_database_url_here',
    '',
    '# Redis (if enabled)',
    '# REDIS_URL=redis://localhost:6379',
    '',
    '# Other Environment Variables'
  ];
  
  // Add remaining environment variables
  Object.entries(baseEnvVars)
    .filter(([key]) => !['NODE_ENV', 'PORT'].includes(key) && !key.startsWith('COOLIFY_'))
    .forEach(([key, value]) => {
      envContent.push(`${key}=${value}`);
    });
  
  // Add example variables if no other vars are available
  if (Object.keys(envVars).length === 0) {
    envContent.push('# Add your environment variables here');
    envContent.push('# EXAMPLE_VAR=example_value');
  }
    
  await fs.writeFile(envPath, envContent.join('\n'));
  console.log(chalk.green(`✓ Created .env file with ${Object.keys(baseEnvVars).length} variables`));
}

async function generateProjectFiles(options: ProjectOptions): Promise<void> {
  console.log(chalk.blue('Generating project files...'));
  
  const projectPath = options.createInCurrentDir ? process.cwd() : path.join(process.cwd(), options.projectName);
  
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
    
    // Create GitHub Actions with PR deployment support
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
- 📝 ESLint and Prettier configured${options.useTauri ? '\n- 🖥️ Tauri integration for ' + options.tauriPlatforms.map(p => p === 'desktop' ? 'Desktop apps' : p.charAt(0).toUpperCase() + p.slice(1)).join(', ') : ''}
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
${options.useTauri ? `
## Tauri Desktop/Mobile App

\`\`\`bash
# Run the desktop app in development
npm run tauri:dev

# Build the desktop app
npm run tauri:build
\`\`\`
${options.tauriPlatforms.includes('android') ? `
### Android

\`\`\`bash
# Run on Android (requires Android Studio and NDK)
npm run tauri:android:dev

# Build for Android
npm run tauri:android:build
\`\`\`
` : ''}${options.tauriPlatforms.includes('ios') ? `
### iOS

\`\`\`bash
# Run on iOS (requires macOS and Xcode)
npm run tauri:ios:dev

# Build for iOS
npm run tauri:ios:build
\`\`\`

**Note**: iOS development requires macOS and Xcode. Run \`npx tauri ios init\` on macOS to set up iOS development.
` : ''}` : ''}
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
${options.useTauri ? `
- **Desktop/Mobile**: Tauri app for ${options.tauriPlatforms.join(', ')}` : ''}${options.database ? `
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
    
    const lowercaseRegistryTag = options.registryTag?.toLowerCase() || options.projectName.toLowerCase();
    
    packageJson.scripts = {
      ...packageJson.scripts,
      'docker:build': `docker build -t ${lowercaseRegistryTag} .`,
      'docker:build:pr': `docker build -t ${lowercaseRegistryTag.replace(':latest', '')}:pr-$(git rev-parse --short HEAD) .`,
      'deploy:prod': 'npm run docker:build && docker push && curl -X POST $COOLIFY_WEBHOOK_URL',
      'deploy:dev': 'npm run docker:build && docker push && curl -X POST $COOLIFY_DEV_WEBHOOK_URL',
      'deploy:pr': 'npm run docker:build:pr && docker push && echo "PR deployment complete"'
    };
    
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    console.log(chalk.green('✓ Added deployment scripts to package.json'));
  }
}

async function createGitHubActions(projectPath: string, options: ProjectOptions): Promise<void> {
  const actionsDir = path.join(projectPath, '.github', 'workflows');
  await fs.ensureDir(actionsDir);
  
  const lowercaseRegistryTag = options.registryTag?.toLowerCase() || options.projectName.toLowerCase();
  
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
          tags: ${lowercaseRegistryTag}
          
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
          tags: ${lowercaseRegistryTag.replace(':latest', ':dev')}
          
      - name: Deploy to Coolify Dev
        run: |
          curl -X POST "\${{ secrets.COOLIFY_DEV_WEBHOOK_URL }}"
`;

  const prWorkflow = `name: PR Preview Deployment

on:
  pull_request:
    types: [opened, synchronize, reopened]
  pull_request_target:
    types: [closed]

jobs:
  deploy-preview:
    runs-on: ubuntu-latest
    if: github.event.action != 'closed' && false # Disabled by default
    
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
          
      - name: Build and push PR image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${lowercaseRegistryTag.replace(':latest', '')}:pr-\${{ github.event.number }}
          
      - name: Create PR deployment in Coolify
        run: |
          # Create a new deployment for this PR
          curl -X POST "\${{ secrets.COOLIFY_API_URL }}/api/v1/projects/\${{ secrets.COOLIFY_PROJECT_ID }}/services" \\
            -H "Authorization: Bearer \${{ secrets.COOLIFY_API_TOKEN }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "name": "pr-\${{ github.event.number }}",
              "image": "${lowercaseRegistryTag.replace(':latest', '')}:pr-\${{ github.event.number }}",
              "type": "service"
            }'
          
      - name: Comment PR with preview URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚀 Preview deployment created! Will be available at: https://pr-' + context.issue.number + '.your-domain.com'
            })

  cleanup-preview:
    runs-on: ubuntu-latest
    if: github.event.action == 'closed' && false # Disabled by default
    
    steps:
      - name: Delete PR deployment
        run: |
          # Delete the PR deployment from Coolify
          curl -X DELETE "\${{ secrets.COOLIFY_API_URL }}/api/v1/services/pr-\${{ github.event.number }}" \\
            -H "Authorization: Bearer \${{ secrets.COOLIFY_API_TOKEN }}"
          
      - name: Comment PR about cleanup
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🧹 PR preview deployment has been cleaned up.'
            })
`;

  await fs.writeFile(path.join(actionsDir, 'deploy-prod.yml'), prodWorkflow);
  await fs.writeFile(path.join(actionsDir, 'deploy-dev.yml'), devWorkflow);
  await fs.writeFile(path.join(actionsDir, 'deploy-pr.yml'), prWorkflow);
  
  console.log(chalk.green('✓ Created GitHub Actions workflows with PR deployment support (disabled by default)'));
}

async function addAdditionalDependencies(projectName: string): Promise<void> {
  console.log(chalk.blue('Adding additional dependencies...'));
  
  const projectPath = projectName === '.' ? process.cwd() : path.join(process.cwd(), projectName);
  
  try {
    // Install ESLint, Prettier, and Tailwind CSS
    console.log(chalk.blue('Installing ESLint, Prettier, and Tailwind CSS...'));
    
    // Change to project directory
    const originalCwd = process.cwd();
    if (projectName !== '.') {
      process.chdir(projectPath);
    }
    
    // Install Tailwind CSS and PostCSS
    await executeCommand('npm install -D tailwindcss postcss autoprefixer @tailwindcss/typography');
    
    // Initialize Tailwind CSS config
    try {
      await executeCommand('npx tailwindcss init -p');
    } catch (error) {
      // If init fails, create config manually
      await configureTailwindCSS();
    }
    
    // Install ESLint if not already present
    const packageJson = await fs.readJson('package.json');
    if (!packageJson.devDependencies['eslint']) {
      await executeCommand('npm install -D eslint @typescript-eslint/eslint-parser @typescript-eslint/parser');
    }
    
    // Install Prettier if not already present
    if (!packageJson.devDependencies['prettier']) {
      await executeCommand('npm install -D prettier prettier-plugin-svelte');
    }
    
    // Configure Tailwind CSS if not already done
    if (!await fs.pathExists('tailwind.config.js')) {
      await configureTailwindCSS();
    }
    
    console.log(chalk.green('✓ Additional dependencies installed successfully'));
    
    // Return to original directory if we changed
    if (projectName !== '.') {
      process.chdir(originalCwd);
    }
    
  } catch (error: any) {
    console.error(chalk.red('Failed to add additional dependencies:'), error.message);
    console.log(chalk.yellow('You can add these manually later:'));
    console.log(chalk.yellow('  npm install -D tailwindcss postcss autoprefixer'));
    console.log(chalk.yellow('  npx tailwindcss init -p'));
    
    // Return to original directory if we changed
    if (projectName !== '.') {
      const originalCwd = process.cwd();
      process.chdir(originalCwd);
    }
  }
}

async function configureTailwindCSS(): Promise<void> {
  // Update tailwind.config.js
  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
`;
  
  await fs.writeFile('tailwind.config.js', tailwindConfig);
  
  // Create or update app.css
  const appCssPath = path.join('src', 'app.css');
  const tailwindImports = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
  
  // Check if app.css exists and prepend Tailwind imports
  if (await fs.pathExists(appCssPath)) {
    const existingCss = await fs.readFile(appCssPath, 'utf8');
    if (!existingCss.includes('@tailwind')) {
      await fs.writeFile(appCssPath, tailwindImports + '\n' + existingCss);
    }
  } else {
    await fs.writeFile(appCssPath, tailwindImports);
  }
  
  console.log(chalk.green('✓ Tailwind CSS configured'));
}