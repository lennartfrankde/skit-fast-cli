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
    console.log(chalk.cyan('  3. ./setup-dev.sh       # Quick setup script'));
    console.log(chalk.cyan('     OR npm run dev:setup # Start local services and development server'));
  } else {
    console.log(chalk.cyan('  1. npm install'));
    console.log(chalk.cyan('  2. ./setup-dev.sh       # Quick setup script'));
    console.log(chalk.cyan('     OR npm run dev:setup # Start local services and development server'));
  }
  
  console.log(chalk.yellow('\n🚀 Quick local development:'));
  console.log(chalk.cyan('   ./setup-dev.sh           # One-click setup with guidance'));
  console.log(chalk.cyan('   npm run services:start   # Start database, cache & AI services'));
  console.log(chalk.cyan('   npm run dev              # Start SvelteKit dev server'));
  console.log(chalk.cyan('   npm run services:stop    # Stop all local services'));
  
  console.log(chalk.blue('\n📦 Add more SvelteKit packages anytime:'));
  console.log(chalk.cyan('   npx sv add @sveltejs/adapter-node  # Change adapter'));
  console.log(chalk.cyan('   npx sv add drizzle                 # Add Drizzle ORM'));
  console.log(chalk.cyan('   npx sv add lucia                   # Add Lucia auth'));
  console.log(chalk.cyan('   npx sv add mdsvex                  # Add MDX support'));
  console.log(chalk.cyan('   npx sv add tailwindcss             # Add Tailwind CSS with plugins'));
  console.log(chalk.cyan('   npx sv add vitest                  # Add Vitest testing'));
  
  console.log(chalk.yellow('\n💡 To enhance Tailwind CSS:'));
  console.log(chalk.cyan('   cd into your project directory and run "npx sv add tailwindcss"'));
  console.log(chalk.cyan('   then select typography and forms plugins when prompted'));
  console.log(chalk.cyan('   npm run services:stop    # Stop all local services'));
  
  if (options.useTauri) {
    const nextStep = options.createInCurrentDir ? '3' : '4';
    console.log(chalk.cyan(`  ${nextStep}. npm run tauri dev # to run the desktop app`));
    if (options.tauriPlatforms.includes('android')) {
      console.log(chalk.cyan(`  ${parseInt(nextStep) + 1}. npm run tauri android dev # to run on Android`));
    }
  }
  
  if (options.useCoolify) {
    const step = options.useTauri ? (options.createInCurrentDir ? '5' : '6') : (options.createInCurrentDir ? '3' : '4');
    console.log(chalk.cyan(`  ${step}. npm run deploy:trigger # to trigger Coolify deployment`));
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
        message: 'Coolify URL (e.g., https://coolify.yourserver.com):',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Coolify URL is required';
          }
          try {
            const url = new URL(input);
            if (!url.protocol.startsWith('http')) {
              return 'URL must start with http:// or https://';
            }
            return true;
          } catch {
            return 'Please enter a valid URL (e.g., https://coolify.yourserver.com)';
          }
        }
      },
      {
        type: 'confirm',
        name: 'showTokenInConsole',
        message: 'Do you want to show the API token in the console for easier pasting?',
        default: true
      }
    ]);
    
    // Show token input based on user preference
    const tokenInputType = coolifyAnswers.showTokenInConsole ? 'input' : 'password';
    const tokenPrompt = await inquirer.prompt([
      {
        type: tokenInputType,
        name: 'coolifyApiToken',
        message: 'Coolify API Token (generate in Settings → API Tokens):',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'API token is required';
          }
          if (input.trim().length < 10) {
            return 'API token seems too short. Please check and try again.';
          }
          return true;
        }
      }
    ]);
    
    // Get docker registry separately
    const registryPrompt = await inquirer.prompt([
      {
        type: 'input',
        name: 'dockerRegistry',
        message: 'Docker registry (optional):',
        default: 'ghcr.io'
      }
    ]);
    
    // Merge token input with coolify answers
    coolifyAnswers.coolifyApiToken = tokenPrompt.coolifyApiToken;
    coolifyAnswers.dockerRegistry = registryPrompt.dockerRegistry;
    
    if (coolifyAnswers.showTokenInConsole && tokenPrompt.coolifyApiToken) {
      console.log(chalk.cyan('\n📋 Your API token (for reference): ') + chalk.yellow(tokenPrompt.coolifyApiToken));
      console.log(chalk.gray('   This token will be saved to your .env file\n'));
    }
    
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
    
    // Initialize Tauri with non-interactive mode
    console.log(chalk.blue('Initializing Tauri...'));
    try {
      // Try non-interactive initialization first
      await executeCommand('npx tauri init --ci');
    } catch (ciError: any) {
      // If --ci flag not available, try with predefined answers
      try {
        await executeCommand(`echo -e "\\n\\n\\n\\n\\n" | npx tauri init`);
      } catch (pipeError: any) {
        // If piping doesn't work, try a different approach
        console.log(chalk.yellow('⚠️ Interactive Tauri init detected. Using manual configuration...'));
        await createTauriConfigManually(options);
      }
    }
    
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

async function createTauriConfigManually(options: ProjectOptions): Promise<void> {
  console.log(chalk.blue('Creating Tauri configuration manually...'));
  
  const srcTauriDir = path.join(process.cwd(), 'src-tauri');
  await fs.ensureDir(srcTauriDir);
  
  // Create Cargo.toml
  const cargoToml = `[package]
name = "${options.projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}"
version = "0.0.0"
description = "A Tauri App"
authors = ["you"]
license = ""
repository = ""
edition = "2021"

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[build-dependencies]
tauri-build = { version = "1.0", features = [] }

[dependencies]
tauri = { version = "1.0", features = ["api-all"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[features]
# this feature is used for production builds or when \`devPath\` points to the filesystem
# DO NOT REMOVE!!
custom-protocol = ["tauri/custom-protocol"]
`;

  await fs.writeFile(path.join(srcTauriDir, 'Cargo.toml'), cargoToml);
  console.log(chalk.green('✓ Created Cargo.toml'));

  // Create main.rs
  const srcDir = path.join(srcTauriDir, 'src');
  await fs.ensureDir(srcDir);
  
  const mainRs = `// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`;

  await fs.writeFile(path.join(srcDir, 'main.rs'), mainRs);
  console.log(chalk.green('✓ Created main.rs'));

  // Create tauri.conf.json
  const tauriConfig = {
    build: {
      beforeDevCommand: "npm run dev",
      beforeBuildCommand: "npm run build",
      devPath: "http://localhost:5173",
      distDir: "../build",
      withGlobalTauri: false
    },
    package: {
      productName: options.projectName,
      version: "0.0.0"
    },
    tauri: {
      allowlist: {
        all: false,
        shell: {
          all: false,
          open: true
        }
      },
      bundle: {
        active: true,
        targets: "all",
        identifier: `com.${options.projectName.toLowerCase().replace(/[^a-z0-9]/g, '')}.app`,
        icon: [
          "icons/32x32.png",
          "icons/128x128.png",
          "icons/128x128@2x.png",
          "icons/icon.icns",
          "icons/icon.ico"
        ]
      },
      security: {
        csp: null
      },
      windows: [
        {
          fullscreen: false,
          resizable: true,
          title: options.projectName,
          width: 800,
          height: 600
        }
      ]
    }
  };

  await fs.writeJson(path.join(srcTauriDir, 'tauri.conf.json'), tauriConfig, { spaces: 2 });
  console.log(chalk.green('✓ Created tauri.conf.json'));

  // Create build.rs
  const buildRs = `fn main() {
    tauri_build::build()
}
`;

  await fs.writeFile(path.join(srcTauriDir, 'build.rs'), buildRs);
  console.log(chalk.green('✓ Created build.rs'));

  // Create icons directory (optional)
  const iconsDir = path.join(srcTauriDir, 'icons');
  await fs.ensureDir(iconsDir);
  console.log(chalk.green('✓ Created icons directory'));
  
  console.log(chalk.green('✅ Tauri configuration created manually'));
  console.log(chalk.yellow('Note: You may need to add app icons to src-tauri/icons/ directory'));
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
      ? ['sv', 'create', '.', '--template', 'minimal', '--types', 'ts']
      : ['sv', 'create', options.projectName, '--template', 'minimal', '--types', 'ts'];
    
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
    
    // Note: Dependencies are not automatically installed. Users can install them manually as needed.
    
  } catch (error: any) {
    console.error(chalk.red('Failed to create SvelteKit project:'), error.message);
    throw error;
  }
}

async function setupCoolifyDeployment(options: ProjectOptions): Promise<void> {
  if (!options.coolifyUrl || !options.coolifyApiToken) {
    return;
  }

  console.log(chalk.blue('Setting up comprehensive Coolify deployment...'));
  console.log(chalk.gray(`Using Coolify URL: ${options.coolifyUrl}`));
  console.log(chalk.gray(`API Token: ${options.coolifyApiToken.substring(0, 10)}...`));
  
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
    const project = await coolify.createProject(projectName, `Auto-created SvelteKit project with full infrastructure`);
    
    // Validate project creation
    if (!project || !project.id) {
      throw new Error('Failed to create project: Invalid response from Coolify API');
    }
    
    console.log(chalk.green(`✓ Created Coolify project: ${projectName} (ID: ${project.id})`));
    
    // Set up complete project infrastructure using the new comprehensive method
    console.log(chalk.blue('Setting up complete project infrastructure...'));
    const infrastructure = await coolify.setupProjectInfrastructure(project.id, {
      includeSvelteKit: !!options.registryTag,
      dockerImage: options.registryTag?.toLowerCase(),
      includeDatabase: options.database,
      includeRedis: options.useRedis,
      includeServices: options.services
    });
    
    console.log(chalk.green(`✅ Created ${infrastructure.services.length} services in Coolify project`));
    
    // Retrieve webhook URLs for deployment automation
    console.log(chalk.blue('Retrieving deployment webhook URLs...'));
    const webhookEnvVars: Record<string, string> = {};
    
    for (const service of infrastructure.services) {
      console.log(chalk.cyan(`   • ${service.name}: Service created successfully`));
      
      // Get webhook URL for SvelteKit app
      if (service.name === 'app' || service.name.includes('sveltekit')) {
        const webhookUrl = await coolify.getServiceWebhook(project.id, service.id);
        if (webhookUrl) {
          webhookEnvVars.COOLIFY_WEBHOOK_URL = webhookUrl;
          webhookEnvVars.COOLIFY_DEPLOY_WEBHOOK = webhookUrl;
          console.log(chalk.green(`✓ Retrieved deployment webhook URL`));
        }
      }
    }
    
    // Get comprehensive environment variables including service connection details
    console.log(chalk.blue('Generating environment variables with service configurations...'));
    const envVars = await coolify.getEnvironmentVariables(project.id);
    
    // Add service-specific environment variables
    const serviceEnvVars: Record<string, string> = { ...webhookEnvVars };
    
    // Add database connection strings
    if (options.database === 'pocketbase') {
      serviceEnvVars.POCKETBASE_URL = 'http://pocketbase:8090';
      serviceEnvVars.DATABASE_TYPE = 'pocketbase';
    } else if (options.database === 'mongodb') {
      serviceEnvVars.MONGODB_URL = 'mongodb://admin:admin123@mongodb:27017/app?authSource=admin';
      serviceEnvVars.DATABASE_TYPE = 'mongodb';
    }
    
    // Add Redis connection
    if (options.useRedis) {
      serviceEnvVars.REDIS_URL = 'redis://:redis123@redis:6379';
    }
    
    // Add service URLs
    if (options.services.includes('litellm')) {
      serviceEnvVars.LITELLM_URL = 'http://litellm:4000';
      serviceEnvVars.LITELLM_API_BASE = 'http://litellm:4000';
    }
    
    if (options.services.includes('qdrant')) {
      serviceEnvVars.QDRANT_URL = 'http://qdrant:6333';
      serviceEnvVars.QDRANT_GRPC_URL = 'http://qdrant:6334';
    }
    
    const projectDir = options.createInCurrentDir ? '.' : options.projectName;
    await createEnvironmentFile(projectDir, { ...envVars, ...serviceEnvVars }, options.coolifyUrl, options.coolifyApiToken);
    
    console.log(chalk.green('✅ Comprehensive Coolify deployment setup completed!'));
    console.log(chalk.cyan(`🌐 Project URL: ${options.coolifyUrl}/projects/${project.id}`));
    
    // Display service summary
    console.log(chalk.blue('\n📋 Created Services Summary:'));
    if (options.registryTag) {
      console.log(chalk.cyan(`   • SvelteKit App: Docker deployment with health checks`));
    }
    if (options.database === 'pocketbase') {
      console.log(chalk.cyan(`   • PocketBase: Database with persistent storage`));
    } else if (options.database === 'mongodb') {
      console.log(chalk.cyan(`   • MongoDB: Database with persistent storage`));
    }
    if (options.useRedis) {
      console.log(chalk.cyan(`   • Redis: Cache with password protection`));
    }
    if (options.services.includes('litellm')) {
      console.log(chalk.cyan(`   • LiteLLM: AI Gateway for multiple LLM providers`));
    }
    if (options.services.includes('qdrant')) {
      console.log(chalk.cyan(`   • Qdrant: Vector database for AI embeddings`));
    }
    console.log(chalk.cyan(`   • Network: All services connected via app-network`));
    
  } catch (error: any) {
    console.error(chalk.red('Failed to set up comprehensive Coolify deployment:'), error.message);
    
    // Provide specific guidance based on common error patterns
    if (error.message.includes('connect to Coolify API')) {
      console.log(chalk.yellow('\n🔧 Connection troubleshooting:'));
      console.log(chalk.yellow('   1. Verify your Coolify instance is running and accessible'));
      console.log(chalk.yellow('   2. Check if the URL format is correct (e.g., https://coolify.yourserver.com)'));
      console.log(chalk.yellow('   3. Ensure your API token is valid and not expired'));
      console.log(chalk.yellow('   4. Check firewall/network settings if using a remote server'));
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log(chalk.yellow('\n🔑 Authentication troubleshooting:'));
      console.log(chalk.yellow('   1. Generate a new API token in Coolify dashboard'));
      console.log(chalk.yellow('   2. Ensure the token has project creation permissions'));
      console.log(chalk.yellow('   3. Copy the token carefully without extra spaces or characters'));
    }
    
    console.log(chalk.yellow('\nYou can set up Coolify deployment manually later.'));
    console.log(chalk.yellow('The project files will still be generated with Docker support.'));
    
    // Still save credentials to .env even if Coolify setup fails
    if (options.coolifyUrl && options.coolifyApiToken) {
      const projectDir = options.createInCurrentDir ? '.' : options.projectName;
      await createEnvironmentFile(projectDir, {}, options.coolifyUrl, options.coolifyApiToken);
    }
  }
}

async function createEnvironmentFile(projectDir: string, envVars: Record<string, string>, coolifyUrl?: string, coolifyApiToken?: string): Promise<void> {
  // Ensure we have the correct absolute path for the .env file
  let envPath: string;
  
  if (projectDir === '.') {
    // Creating in current directory
    envPath = path.join(process.cwd(), '.env');
  } else if (path.isAbsolute(projectDir)) {
    // Absolute path provided
    envPath = path.join(projectDir, '.env');
  } else {
    // Relative path - join with current working directory
    envPath = path.join(process.cwd(), projectDir, '.env');
  }
  
  console.log(chalk.gray(`Creating .env file at: ${envPath}`));
  
  // Ensure the directory exists
  await fs.ensureDir(path.dirname(envPath));
  
  // Create base environment variables with sensible defaults
  const baseEnvVars: Record<string, string> = {
    NODE_ENV: 'development',
    PORT: '3000',
    HOST: '0.0.0.0',
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
    '# Generated by skit-fast-cli with comprehensive Coolify integration',
    '',
    '# Application Configuration',
    ...Object.entries(baseEnvVars)
      .filter(([key]) => ['NODE_ENV', 'PORT', 'HOST'].includes(key))
      .map(([key, value]) => `${key}=${value}`),
    '',
    '# Coolify Configuration',
    ...Object.entries(baseEnvVars)
      .filter(([key]) => key.startsWith('COOLIFY_'))
      .map(([key, value]) => `${key}=${value}`),
    '',
    '# Database Configuration',
    ...Object.entries(baseEnvVars)
      .filter(([key]) => key.includes('DATABASE') || key.includes('MONGODB') || key.includes('POCKETBASE'))
      .map(([key, value]) => `${key}=${value}`),
    '',
    '# Cache Configuration',
    ...Object.entries(baseEnvVars)
      .filter(([key]) => key.includes('REDIS'))
      .map(([key, value]) => `${key}=${value}`),
    '',
    '# AI Services Configuration',
    ...Object.entries(baseEnvVars)
      .filter(([key]) => key.includes('LITELLM') || key.includes('QDRANT'))
      .map(([key, value]) => `${key}=${value}`),
    '',
    '# Local Development Configuration',
    '# Use these URLs for local development with docker-compose',
    'DATABASE_URL_LOCAL=http://localhost:8090',
    'REDIS_URL_LOCAL=redis://localhost:6379',
    'LITELLM_URL_LOCAL=http://localhost:4000',
    'QDRANT_URL_LOCAL=http://localhost:6333',
    '',
    '# Other Environment Variables'
  ];
  
  // Add remaining environment variables
  Object.entries(baseEnvVars)
    .filter(([key]) => !['NODE_ENV', 'PORT', 'HOST'].includes(key) 
      && !key.startsWith('COOLIFY_')
      && !key.includes('DATABASE') && !key.includes('MONGODB') && !key.includes('POCKETBASE')
      && !key.includes('REDIS')
      && !key.includes('LITELLM') && !key.includes('QDRANT'))
    .forEach(([key, value]) => {
      envContent.push(`${key}=${value}`);
    });
  
  // Add example variables if no service vars are available
  if (Object.keys(envVars).length === 0) {
    envContent.push('# Service connection examples (uncomment and modify as needed):');
    envContent.push('# DATABASE_URL=your_database_url_here');
    envContent.push('# REDIS_URL=redis://localhost:6379');
    envContent.push('# LITELLM_URL=http://localhost:4000');
    envContent.push('# QDRANT_URL=http://localhost:6333');
  }
    
  await fs.writeFile(envPath, envContent.join('\n'));
  console.log(chalk.green(`✓ Created comprehensive .env file with ${Object.keys(baseEnvVars).length} variables`));
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
    
    // Create health check endpoint for SvelteKit if using Coolify
    if (options.useCoolify) {
      const healthDir = path.join(projectPath, 'src', 'routes', 'health');
      await fs.ensureDir(healthDir);
      
      const healthEndpointContent = `// Health check endpoint for Coolify deployment
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      database: process.env.DATABASE_TYPE || 'none',
      redis: process.env.REDIS_URL ? 'connected' : 'not configured',
      litellm: process.env.LITELLM_URL ? 'available' : 'not configured',
      qdrant: process.env.QDRANT_URL ? 'available' : 'not configured'
    }
  };

  return json(health);
};`;
      
      const healthEndpointPath = path.join(healthDir, '+server.ts');
      await fs.writeFile(healthEndpointPath, healthEndpointContent);
      console.log(chalk.green('✓ Created health check endpoint at /health'));
    }
    
    // Copy LiteLLM config if LiteLLM is selected
    if (options.services.includes('litellm')) {
      const litellmConfigPath = path.join(projectPath, 'litellm-config.yaml');
      const templateLitellmConfig = path.join(templatesDir, 'litellm-config.yaml');
      if (await fs.pathExists(templateLitellmConfig)) {
        await fs.copy(templateLitellmConfig, litellmConfigPath);
        console.log(chalk.green('✓ Created litellm-config.yaml'));
      } else {
        // Create a default LiteLLM config
        const defaultLiteLLMConfig = `model_list:
  - model_name: gpt-3.5-turbo
    litellm_params:
      model: openai/gpt-3.5-turbo
      api_key: os.environ/OPENAI_API_KEY
  - model_name: claude-3-haiku
    litellm_params:
      model: anthropic/claude-3-haiku-20240307
      api_key: os.environ/ANTHROPIC_API_KEY

general_settings:
  master_key: os.environ/MASTER_KEY
  database_url: "postgresql://..."  # Optional
`;
        await fs.writeFile(litellmConfigPath, defaultLiteLLMConfig);
        console.log(chalk.green('✓ Created default litellm-config.yaml'));
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
    
    // Copy local development setup script
    const setupScriptPath = path.join(projectPath, 'setup-dev.sh');
    const templateSetupScript = path.join(templatesDir, 'setup-dev.sh');
    if (await fs.pathExists(templateSetupScript)) {
      await fs.copy(templateSetupScript, setupScriptPath);
      // Make the script executable
      try {
        await fs.chmod(setupScriptPath, '755');
        console.log(chalk.green('✓ Created local development setup script (setup-dev.sh)'));
      } catch (error) {
        console.log(chalk.yellow('Warning: Could not make setup script executable'));
      }
    }
    
  } catch (error: any) {
    console.log(chalk.yellow('Warning: Could not copy all template files:'), error.message);
  }
}

async function createProjectReadme(projectPath: string, options: ProjectOptions): Promise<void> {
  const readmePath = path.join(projectPath, 'README.md');
  
  const readmeContent = `# ${options.projectName}

A fast SvelteKit project created with skit-fast-cli and comprehensive Coolify integration.

## Features

- ⚡ SvelteKit with TypeScript
- 🎨 Tailwind CSS with all features enabled
- 📝 ESLint and Prettier configured${options.useTauri ? '\n- 🖥️ Tauri integration for ' + options.tauriPlatforms.map(p => p === 'desktop' ? 'Desktop apps' : p.charAt(0).toUpperCase() + p.slice(1)).join(', ') : ''}
- 🐳 Docker ready with optimized multi-stage build${options.useCoolify ? '\n- 🚀 Complete Coolify deployment with auto-provisioned infrastructure' : ''}${options.database ? `\n- 🗄️ ${options.database.charAt(0).toUpperCase() + options.database.slice(1)} database with persistent storage` : ''}${options.useRedis ? '\n- 🔴 Redis cache with password protection' : ''}${options.services.includes('litellm') ? '\n- 🤖 LiteLLM AI Gateway for multiple LLM providers' : ''}${options.services.includes('qdrant') ? '\n- 🔍 Qdrant vector database for AI embeddings' : ''}
- 🔗 Service networking and health checks configured
- ⚙️ Comprehensive environment configuration

## Development

\`\`\`bash
# Install dependencies
npm install

# One-click local development setup
./setup-dev.sh

# Or start services manually:
npm run services:start    # Start database, cache & AI services
npm run dev               # Start SvelteKit development server
\`\`\`

### Quick Setup Script

The easiest way to get started is with the included setup script:

\`\`\`bash
./setup-dev.sh
\`\`\`

This script will:
- Check for Docker installation
- Start all required local services
- Display service URLs and next steps
- Provide helpful commands for development

### Local Development Commands

\`\`\`bash
# One-click setup with guidance
./setup-dev.sh

# Manual service management
npm run services:start   # Start all local services (DB, Redis, AI services)
npm run services:stop    # Stop all local services  
npm run services:logs    # View logs from all services

# SvelteKit development
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build

# Development teardown
npm run dev:teardown     # Stop all services when done
\`\`\`

### Local Services

When you run \`npm run services:start\`, the following services will be available:

${options.database === 'pocketbase' ? '- **PocketBase**: http://localhost:8090 (Database + Admin UI)' : ''}${options.database === 'mongodb' ? '- **MongoDB**: localhost:27017 (Database)' : ''}${options.useRedis ? '\n- **Redis**: localhost:6379 (Cache)' : ''}${options.services.includes('litellm') ? '\n- **LiteLLM**: http://localhost:4000 (AI Gateway)' : ''}${options.services.includes('qdrant') ? '\n- **Qdrant**: http://localhost:6333 (Vector Database)' : ''}

Your SvelteKit app will automatically connect to these services using the environment variables in \`.env\`.
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

# Run with docker-compose (includes all services)
docker-compose up
\`\`\`
${options.useCoolify ? `
## Coolify Deployment

Your project has been automatically configured with a complete infrastructure in Coolify:

### Services Created
${options.registryTag ? '- **SvelteKit App**: Containerized application with health checks and auto-deployment' : ''}${options.database === 'pocketbase' ? '\n- **PocketBase**: Database service with persistent storage and admin interface' : ''}${options.database === 'mongodb' ? '\n- **MongoDB**: Document database with authentication and persistent storage' : ''}${options.useRedis ? '\n- **Redis**: In-memory cache with password protection' : ''}${options.services.includes('litellm') ? '\n- **LiteLLM**: AI Gateway supporting OpenAI, Anthropic, and other LLM providers' : ''}${options.services.includes('qdrant') ? '\n- **Qdrant**: Vector database for AI embeddings and semantic search' : ''}
- **Network**: All services connected via dedicated network for inter-service communication

### Deployment Commands
\`\`\`bash
# Deploy to production
npm run deploy:prod

# Deploy to development
npm run deploy:dev

# Deploy PR preview
npm run deploy:pr
\`\`\`

### Health Monitoring
Your application includes a health check endpoint at \`/health\` that monitors:
- Application status and uptime
- Service connectivity (database, cache, AI services)
- Environment configuration

### Environment Variables
All service connections are pre-configured in your \`.env\` file:
${options.database === 'pocketbase' ? '- \`POCKETBASE_URL\`: PocketBase admin interface' : ''}${options.database === 'mongodb' ? '- \`MONGODB_URL\`: MongoDB connection string with authentication' : ''}${options.useRedis ? '\n- \`REDIS_URL\`: Redis connection with password' : ''}${options.services.includes('litellm') ? '\n- \`LITELLM_URL\`: LiteLLM API gateway endpoint' : ''}${options.services.includes('qdrant') ? '\n- \`QDRANT_URL\`: Qdrant vector database HTTP API' : ''}
` : ''}
## Services${options.database ? `

### Database: ${options.database}
${options.database === 'pocketbase' ? 'PocketBase provides a complete backend with admin UI, real-time subscriptions, and file storage.' : 'MongoDB offers flexible document storage with rich query capabilities.'}
- **Development**: Available at http://localhost:${options.database === 'pocketbase' ? '8090' : '27017'}
- **Production**: Auto-configured in Coolify with persistent storage` : ''}${options.useRedis ? `

### Cache: Redis
Redis provides high-performance caching and session storage.
- **Development**: Available at redis://localhost:6379
- **Production**: Auto-configured with password protection` : ''}${options.services.includes('litellm') ? `

### AI Gateway: LiteLLM
LiteLLM provides a unified API for multiple LLM providers.
- **Development**: Available at http://localhost:4000
- **Supported Providers**: OpenAI, Anthropic, Cohere, and more
- **Configuration**: Edit \`litellm-config.yaml\` for your API keys` : ''}${options.services.includes('qdrant') ? `

### Vector Database: Qdrant
Qdrant provides vector storage for AI embeddings and semantic search.
- **Development**: Available at http://localhost:6333
- **Production**: Auto-configured with persistent storage
- **Web UI**: Access the dashboard for vector management` : ''}

## GitHub Actions

GitHub Actions workflows are included but disabled by default. To enable:

1. Set up repository secrets:
   - \`DOCKER_REGISTRY\`
   - \`DOCKER_USERNAME\` 
   - \`DOCKER_PASSWORD\`${options.useCoolify ? `
   - \`COOLIFY_WEBHOOK_URL\`
   - \`COOLIFY_DEV_WEBHOOK_URL\`
   - \`COOLIFY_API_URL\`
   - \`COOLIFY_API_TOKEN\`
   - \`COOLIFY_PROJECT_ID\`` : ''}

2. Edit \`.github/workflows/*.yml\` and change \`if: false\` to \`if: true\`

Features:
- **Production deployment**: Automatic deployment on main branch
- **Development deployment**: Automatic deployment on dev/develop branches  
- **PR previews**: Temporary deployments for each pull request
- **Automatic cleanup**: PR deployments removed when PR is closed

## License

MIT
`;

  await fs.writeFile(readmePath, readmeContent);
  console.log(chalk.green('✓ Created comprehensive README.md with service documentation'));
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
  // Create main docker-compose.yml for production
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

  if (options.database === 'mongodb') {
    dependencies.push('mongodb');
    services += `
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=admin123
      - MONGO_INITDB_DATABASE=app
    volumes:
      - mongodb_data:/data/db`;
  }

  if (options.useRedis) {
    dependencies.push('redis');
    services += `
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    command: redis-server --requirepass redis123
    volumes:
      - redis_data:/data`;
  }

  // Add LiteLLM service
  if (options.services.includes('litellm')) {
    dependencies.push('litellm');
    services += `
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "4000:4000"
    environment:
      - MASTER_KEY=sk-1234
    volumes:
      - ./litellm-config.yaml:/app/config.yaml
    command: ["--config", "/app/config.yaml", "--port", "4000", "--host", "0.0.0.0"]`;
  }

  // Add Qdrant service
  if (options.services.includes('qdrant')) {
    dependencies.push('qdrant');
    services += `
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage`;
  }

  if (dependencies.length > 0) {
    services += '\n      - ' + dependencies.join('\n      - ');
  }

  services += '\n\nvolumes:';
  if (options.database === 'pocketbase') {
    services += '\n  pocketbase_data:';
  }
  if (options.database === 'mongodb') {
    services += '\n  mongodb_data:';
  }
  if (options.useRedis) {
    services += '\n  redis_data:';
  }
  if (options.services.includes('qdrant')) {
    services += '\n  qdrant_data:';
  }

  await fs.writeFile(path.join(projectPath, 'docker-compose.yml'), services);
  console.log(chalk.green('✓ Created docker-compose.yml'));

  // Create docker-compose.dev.yml for local development only (no app service)
  let devServices = `version: '3.8'

services:`;

  const devDependencies: string[] = [];

  if (options.database === 'pocketbase') {
    devServices += `
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    ports:
      - "8090:8090"
    volumes:
      - pocketbase_data:/pb_data`;
  }

  if (options.database === 'mongodb') {
    devServices += `
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=admin123
      - MONGO_INITDB_DATABASE=app
    volumes:
      - mongodb_data:/data/db`;
  }

  if (options.useRedis) {
    devServices += `
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    command: redis-server --requirepass redis123
    volumes:
      - redis_data:/data`;
  }

  if (options.services.includes('litellm')) {
    devServices += `
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "4000:4000"
    environment:
      - MASTER_KEY=sk-1234
    volumes:
      - ./litellm-config.yaml:/app/config.yaml
    command: ["--config", "/app/config.yaml", "--port", "4000", "--host", "0.0.0.0"]`;
  }

  if (options.services.includes('qdrant')) {
    devServices += `
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage`;
  }

  devServices += '\n\nvolumes:';
  if (options.database === 'pocketbase') {
    devServices += '\n  pocketbase_data:';
  }
  if (options.database === 'mongodb') {
    devServices += '\n  mongodb_data:';
  }
  if (options.useRedis) {
    devServices += '\n  redis_data:';
  }
  if (options.services.includes('qdrant')) {
    devServices += '\n  qdrant_data:';
  }

  await fs.writeFile(path.join(projectPath, 'docker-compose.dev.yml'), devServices);
  console.log(chalk.green('✓ Created docker-compose.dev.yml for local services'));
}

async function createDeploymentScripts(projectPath: string, options: ProjectOptions): Promise<void> {
  // Create package.json scripts
  const packageJsonPath = path.join(projectPath, 'package.json');
  
  if (await fs.pathExists(packageJsonPath)) {
    const packageJson = await fs.readJson(packageJsonPath);
    
    const lowercaseRegistryTag = options.registryTag?.toLowerCase() || options.projectName.toLowerCase();
    
    // Base scripts for all projects
    const baseScripts = {
      ...packageJson.scripts,
      'docker:build': `docker build -t ${lowercaseRegistryTag} .`,
      'docker:run': `docker run -p 3000:3000 ${lowercaseRegistryTag}`,
      'services:start': 'docker-compose -f docker-compose.dev.yml up -d',
      'services:stop': 'docker-compose -f docker-compose.dev.yml down',
      'services:logs': 'docker-compose -f docker-compose.dev.yml logs -f',
      'dev:setup': 'npm run services:start && echo "🚀 Local services started! Run npm run dev to start development server"',
      'dev:teardown': 'npm run services:stop',
      'dev:full': 'npm run services:start && npm run dev'
    };

    // Add Coolify deployment scripts if configured
    if (options.useCoolify && options.coolifyUrl) {
      baseScripts['docker:build:pr'] = `docker build -t ${lowercaseRegistryTag.replace(':latest', '')}:pr-$(git rev-parse --short HEAD) .`;
      baseScripts['deploy:prod'] = 'npm run docker:build && docker push && curl -X POST "$COOLIFY_WEBHOOK_URL"';
      baseScripts['deploy:trigger'] = 'curl -X POST "$COOLIFY_WEBHOOK_URL"';
      baseScripts['deploy:pr'] = 'npm run docker:build:pr && docker push && echo "PR deployment complete"';
    }

    packageJson.scripts = baseScripts;
    
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    console.log(chalk.green('✓ Added local development and deployment scripts to package.json'));
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

