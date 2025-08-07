import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import { CoolifyProject, CoolifyService, ProjectOptions } from '../types';

export class CoolifyClient {
  private client: AxiosInstance;

  constructor(baseUrl: string, apiToken: string) {
    // Ensure the URL doesn't end with a slash and doesn't include /api/v1
    let cleanUrl = baseUrl.trim();
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    // Remove /api/v1 if it's already included to avoid duplication
    if (cleanUrl.endsWith('/api/v1')) {
      cleanUrl = cleanUrl.replace('/api/v1', '');
    }
    
    this.client = axios.create({
      baseURL: cleanUrl,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log(chalk.blue(`Testing connection to: ${this.client.defaults.baseURL}/api/v1/teams`));
      const response = await this.client.get('/api/v1/teams');
      return true;
    } catch (error: any) {
      console.error(chalk.red('Failed to connect to Coolify API'));
      console.error(chalk.red(`URL attempted: ${this.client.defaults.baseURL}/api/v1/teams`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response: ${JSON.stringify(error.response.data, null, 2)}`));
      } else if (error.request) {
        console.error(chalk.red('No response received. Check if the URL is correct and the server is running.'));
        console.error(chalk.red(`Request details: ${error.message}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      
      console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.log(chalk.yellow('   1. Verify your Coolify URL is correct (e.g., https://coolify.yourserver.com)'));
      console.log(chalk.yellow('   2. Check that your API token is valid and has proper permissions'));
      console.log(chalk.yellow('   3. Ensure Coolify is running and accessible from your network'));
      console.log(chalk.yellow('   4. Try accessing the URL in your browser: ' + this.client.defaults.baseURL));
      
      return false;
    }
  }

  async createProject(name: string, description?: string): Promise<CoolifyProject> {
    try {
      console.log(chalk.blue(`Creating project "${name}" in Coolify...`));
      const response = await this.client.post('/api/v1/projects', {
        name,
        description: description || `SvelteKit project: ${name}`
      });
      
      console.log(chalk.green(`✓ Created Coolify project: ${name}`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create project: ${name}`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Error details: ${JSON.stringify(error.response.data, null, 2)}`));
        
        if (error.response.status === 401) {
          console.log(chalk.yellow('\n💡 This looks like an authentication error. Please check:'));
          console.log(chalk.yellow('   - Your API token is correct'));
          console.log(chalk.yellow('   - The token has proper permissions to create projects'));
        } else if (error.response.status === 422) {
          console.log(chalk.yellow('\n💡 This looks like a validation error. Please check:'));
          console.log(chalk.yellow('   - Project name follows Coolify naming conventions'));
          console.log(chalk.yellow('   - A project with this name doesn\'t already exist'));
        }
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      throw error;
    }
  }

  async getProject(projectId: string): Promise<CoolifyProject> {
    try {
      const response = await this.client.get(`/api/v1/projects/${projectId}`);
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to get project: ${error.response?.data?.message || error.message}`));
      throw error;
    }
  }

  async createSvelteKitService(projectId: string, serviceName: string, dockerImage: string): Promise<CoolifyService> {
    try {
      console.log(chalk.blue(`Creating SvelteKit service with image: ${dockerImage}`));
      
      const payload = {
        name: serviceName,
        description: `SvelteKit application service`,
        image: dockerImage,
        ports_exposes: '3000',
        is_container_based_service: true,
        environment_variables: {
          NODE_ENV: 'production',
          PORT: '3000',
          HOST: '0.0.0.0'
        },
        healthcheck: {
          enabled: true,
          path: '/health',
          port: '3000',
          interval: 30,
          timeout: 10,
          retries: 3
        },
        restart_policy: 'unless-stopped'
      };

      console.log(chalk.gray(`API Request: POST /api/v1/projects/${projectId}/services`));
      console.log(chalk.gray(`Payload: ${JSON.stringify(payload, null, 2)}`));
      
      const response = await this.client.post(`/api/v1/projects/${projectId}/services`, payload);
      
      console.log(chalk.green(`✓ Created SvelteKit application service: ${serviceName}`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create SvelteKit service: ${serviceName}`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
        
        if (error.response.status === 422) {
          console.log(chalk.yellow('\n💡 This looks like a validation error. Possible issues:'));
          console.log(chalk.yellow('   - Service name may already exist in the project'));
          console.log(chalk.yellow('   - Docker image URL may be invalid or inaccessible'));
          console.log(chalk.yellow('   - Required fields may be missing in the request'));
        }
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      throw error;
    }
  }

  async getServiceWebhook(projectId: string, serviceId: string): Promise<string | null> {
    try {
      const response = await this.client.get(`/api/v1/projects/${projectId}/services/${serviceId}`);
      const webhook = response.data?.webhook_url || response.data?.auto_deploy_webhook_url || response.data?.git_webhook_url;
      return webhook || null;
    } catch (error: any) {
      console.error(chalk.yellow(`Warning: Could not retrieve webhook URL: ${error.response?.data?.message || error.message}`));
      return null;
    }
  }

  async createPocketBaseService(projectId: string): Promise<CoolifyService> {
    try {
      const payload = {
        name: 'pocketbase',
        description: 'PocketBase database service',
        image: 'ghcr.io/muchobien/pocketbase:latest',
        ports_exposes: '8090',
        is_container_based_service: true,
        environment_variables: {
          POCKETBASE_DATA_DIR: '/pb_data',
          POCKETBASE_PUBLIC_DIR: '/pb_public'
        },
        volumes: [
          {
            name: 'pocketbase_data',
            mount_path: '/pb_data',
            host_path: null
          },
          {
            name: 'pocketbase_public', 
            mount_path: '/pb_public',
            host_path: null
          }
        ],
        healthcheck: {
          enabled: true,
          path: '/api/health',
          port: '8090'
        },
        restart_policy: 'unless-stopped'
      };

      console.log(chalk.gray(`API Request: POST /api/v1/projects/${projectId}/services`));
      const response = await this.client.post(`/api/v1/projects/${projectId}/services`, payload);
      
      console.log(chalk.green(`✓ Created PocketBase service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create PocketBase service`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      throw error;
    }
  }

  async createRedisService(projectId: string): Promise<CoolifyService> {
    try {
      const payload = {
        name: 'redis',
        description: 'Redis cache service',
        image: 'redis:alpine',
        ports_exposes: '6379',
        is_container_based_service: true,
        environment_variables: {
          REDIS_PASSWORD: 'redis123'
        },
        command: 'redis-server --requirepass $REDIS_PASSWORD',
        volumes: [
          {
            name: 'redis_data',
            mount_path: '/data',
            host_path: null
          }
        ],
        healthcheck: {
          enabled: true,
          command: 'redis-cli -a $REDIS_PASSWORD ping'
        },
        restart_policy: 'unless-stopped'
      };

      console.log(chalk.gray(`API Request: POST /api/v1/projects/${projectId}/services`));
      const response = await this.client.post(`/api/v1/projects/${projectId}/services`, payload);
      
      console.log(chalk.green(`✓ Created Redis service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create Redis service`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      throw error;
    }
  }

  async createLiteLLMService(projectId: string): Promise<CoolifyService> {
    try {
      const payload = {
        name: 'litellm',
        description: 'LiteLLM AI Gateway service',
        image: 'ghcr.io/berriai/litellm:main-stable',
        ports_exposes: '4000',
        is_container_based_service: true,
        environment_variables: {
          MASTER_KEY: 'your-master-key-here',
          PORT: '4000',
          DROP_PARAMS: 'true'
        },
        volumes: [
          {
            name: 'litellm_config',
            mount_path: '/app/config.yaml',
            host_path: './litellm-config.yaml'
          }
        ],
        restart_policy: 'unless-stopped'
      };

      console.log(chalk.gray(`API Request: POST /api/v1/projects/${projectId}/services`));
      const response = await this.client.post(`/api/v1/projects/${projectId}/services`, payload);
      
      console.log(chalk.green(`✓ Created LiteLLM service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create LiteLLM service`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      throw error;
    }
  }

  async createQdrantService(projectId: string): Promise<CoolifyService> {
    try {
      const payload = {
        name: 'qdrant',
        description: 'Qdrant vector database service',
        image: 'qdrant/qdrant:latest',
        ports_exposes: '6333',
        is_container_based_service: true,
        environment_variables: {
          QDRANT__SERVICE__HTTP_PORT: '6333',
          QDRANT__SERVICE__GRPC_PORT: '6334'
        },
        volumes: [
          {
            name: 'qdrant_storage',
            mount_path: '/qdrant/storage',
            host_path: null
          }
        ],
        restart_policy: 'unless-stopped'
      };

      console.log(chalk.gray(`API Request: POST /api/v1/projects/${projectId}/services`));
      const response = await this.client.post(`/api/v1/projects/${projectId}/services`, payload);
      
      console.log(chalk.green(`✓ Created Qdrant vector database service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create Qdrant service`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      throw error;
    }
  }

  async createMongoDBService(projectId: string): Promise<CoolifyService> {
    try {
      const payload = {
        name: 'mongodb',
        description: 'MongoDB database service',
        image: 'mongo:latest',
        ports_exposes: '27017',
        is_container_based_service: true,
        environment_variables: {
          MONGO_INITDB_ROOT_USERNAME: 'admin',
          MONGO_INITDB_ROOT_PASSWORD: 'admin123',
          MONGO_INITDB_DATABASE: 'app'
        },
        volumes: [
          {
            name: 'mongodb_data',
            mount_path: '/data/db',
            host_path: null
          }
        ],
        restart_policy: 'unless-stopped'
      };

      console.log(chalk.gray(`API Request: POST /api/v1/projects/${projectId}/services`));
      const response = await this.client.post(`/api/v1/projects/${projectId}/services`, payload);
      
      console.log(chalk.green(`✓ Created MongoDB service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create MongoDB service`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      throw error;
    }
  }

  async getEnvironmentVariables(projectId: string): Promise<Record<string, string>> {
    try {
      const response = await this.client.get(`/api/v1/projects/${projectId}/environment-variables`);
      const envVars: Record<string, string> = {};
      
      response.data.forEach((env: any) => {
        envVars[env.key] = env.value;
      });
      
      return envVars;
    } catch (error: any) {
      console.error(chalk.red(`Failed to get environment variables: ${error.response?.data?.message || error.message}`));
      return {};
    }
  }

  async createProjectNetwork(projectId: string, networkName: string = 'app-network'): Promise<any> {
    try {
      console.log(chalk.blue(`Creating project network: ${networkName}...`));
      const payload = {
        name: networkName,
        driver: 'bridge',
        attachable: true
      };

      console.log(chalk.gray(`API Request: POST /api/v1/projects/${projectId}/networks`));
      const response = await this.client.post(`/api/v1/projects/${projectId}/networks`, payload);
      
      console.log(chalk.green(`✓ Created project network: ${networkName}`));
      return response.data;
    } catch (error: any) {
      // Network creation might not be supported in all Coolify versions
      // This is often handled automatically, so we'll make this non-fatal
      console.log(chalk.yellow(`Note: Could not create custom network (this is often automatic): ${error.response?.data?.message || error.message}`));
      return null;
    }
  }

  async linkServicesToNetwork(projectId: string, serviceIds: string[], networkName: string = 'app-network'): Promise<void> {
    try {
      // Network linking is often handled automatically by Coolify
      // We'll attempt it but make it non-fatal if it fails
      console.log(chalk.blue(`Attempting to link ${serviceIds.length} services to network...`));
      
      for (const serviceId of serviceIds) {
        try {
          await this.client.post(`/api/v1/projects/${projectId}/services/${serviceId}/networks`, {
            network_name: networkName
          });
        } catch (serviceError: any) {
          console.log(chalk.yellow(`Note: Could not link service ${serviceId} to network (often handled automatically)`));
        }
      }
      
      console.log(chalk.green(`✓ Network configuration completed for ${serviceIds.length} services`));
    } catch (error: any) {
      // Don't throw here as network linking is often automatic in Coolify
      console.log(chalk.yellow(`Note: Network linking handled automatically by Coolify`));
    }
  }

  async setupProjectInfrastructure(projectId: string, options: {
    includeSvelteKit: boolean;
    dockerImage?: string;
    includeDatabase: string | null;
    includeRedis: boolean;
    includeServices: string[];
  }): Promise<{ services: CoolifyService[], network?: any }> {
    const services: CoolifyService[] = [];
    
    try {
      console.log(chalk.blue('Setting up project infrastructure...'));
      
      // Create project network for service communication (optional)
      let network = null;
      try {
        network = await this.createProjectNetwork(projectId);
      } catch (networkError) {
        // Network creation is optional and often handled automatically
        console.log(chalk.yellow('Continuing without custom network (Coolify will handle service communication)'));
      }
      
      // Create SvelteKit app if requested
      if (options.includeSvelteKit && options.dockerImage) {
        console.log(chalk.blue('Creating SvelteKit application...'));
        try {
          const svelteKitService = await this.createSvelteKitService(projectId, 'app', options.dockerImage);
          services.push(svelteKitService);
        } catch (error: any) {
          console.error(chalk.red('Failed to create SvelteKit service. This might be due to:'));
          console.error(chalk.red('1. Invalid Docker image URL or image not accessible'));
          console.error(chalk.red('2. Service name already exists in the project'));
          console.error(chalk.red('3. Coolify API version differences'));
          throw error;
        }
      }
      
      // Create database service
      if (options.includeDatabase === 'pocketbase') {
        console.log(chalk.blue('Creating PocketBase database...'));
        try {
          const pocketbaseService = await this.createPocketBaseService(projectId);
          services.push(pocketbaseService);
        } catch (error: any) {
          console.error(chalk.red('Failed to create PocketBase service. Continuing with other services...'));
          console.log(chalk.yellow('You can create the PocketBase service manually in Coolify dashboard.'));
        }
      } else if (options.includeDatabase === 'mongodb') {
        console.log(chalk.blue('Creating MongoDB database...'));
        try {
          const mongoService = await this.createMongoDBService(projectId);
          services.push(mongoService);
        } catch (error: any) {
          console.error(chalk.red('Failed to create MongoDB service. Continuing with other services...'));
          console.log(chalk.yellow('You can create the MongoDB service manually in Coolify dashboard.'));
        }
      }
      
      // Create Redis cache if requested
      if (options.includeRedis) {
        console.log(chalk.blue('Creating Redis cache...'));
        try {
          const redisService = await this.createRedisService(projectId);
          services.push(redisService);
        } catch (error: any) {
          console.error(chalk.red('Failed to create Redis service. Continuing with other services...'));
          console.log(chalk.yellow('You can create the Redis service manually in Coolify dashboard.'));
        }
      }
      
      // Create additional services
      for (const serviceType of options.includeServices) {
        if (serviceType === 'litellm') {
          console.log(chalk.blue('Creating LiteLLM AI Gateway...'));
          try {
            const litellmService = await this.createLiteLLMService(projectId);
            services.push(litellmService);
          } catch (error: any) {
            console.error(chalk.red('Failed to create LiteLLM service. Continuing with other services...'));
            console.log(chalk.yellow('You can create the LiteLLM service manually in Coolify dashboard.'));
          }
        } else if (serviceType === 'qdrant') {
          console.log(chalk.blue('Creating Qdrant vector database...'));
          try {
            const qdrantService = await this.createQdrantService(projectId);
            services.push(qdrantService);
          } catch (error: any) {
            console.error(chalk.red('Failed to create Qdrant service. Continuing with other services...'));
            console.log(chalk.yellow('You can create the Qdrant service manually in Coolify dashboard.'));
          }
        }
      }
      
      // Link all services to the network (if network was created)
      if (services.length > 0) {
        const serviceIds = services.map(s => s.id).filter(id => id); // Filter out any undefined IDs
        if (serviceIds.length > 0) {
          await this.linkServicesToNetwork(projectId, serviceIds);
        }
      }
      
      if (services.length > 0) {
        console.log(chalk.green(`✅ Successfully created ${services.length} services`));
      } else {
        console.log(chalk.yellow('⚠️ No services were created. You may need to create them manually in Coolify.'));
      }
      
      return { services, network };
      
    } catch (error: any) {
      console.error(chalk.red('Error during project infrastructure setup:'), error.message);
      
      // Provide helpful guidance
      console.log(chalk.yellow('\n🔧 Troubleshooting suggestions:'));
      console.log(chalk.yellow('1. Verify your Coolify instance is up to date'));
      console.log(chalk.yellow('2. Check that your API token has sufficient permissions'));
      console.log(chalk.yellow('3. Ensure the project was created successfully before adding services'));
      console.log(chalk.yellow('4. Try creating services manually in the Coolify dashboard'));
      
      if (services.length > 0) {
        console.log(chalk.green(`\nNote: ${services.length} services were created successfully before the error.`));
        return { services, network: null };
      }
      
      throw error;
    }
  }
}