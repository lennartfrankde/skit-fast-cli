import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import { CoolifyProject, CoolifyService, ProjectOptions } from '../types';

export class CoolifyClient {
  private client: AxiosInstance;

  constructor(baseUrl: string, apiToken: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/api/v1/teams');
      return true;
    } catch (error) {
      console.error(chalk.red('Failed to connect to Coolify API'));
      return false;
    }
  }

  async createProject(name: string, description?: string): Promise<CoolifyProject> {
    try {
      const response = await this.client.post('/api/v1/projects', {
        name,
        description: description || `SvelteKit project: ${name}`
      });
      
      console.log(chalk.green(`✓ Created Coolify project: ${name}`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create project: ${error.response?.data?.message || error.message}`));
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
      const response = await this.client.post(`/api/v1/projects/${projectId}/applications`, {
        name: serviceName,
        docker_image: dockerImage,
        ports_exposes: '3000',
        build_pack: 'dockerfile',
        environment_variables: [
          { key: 'NODE_ENV', value: 'production' },
          { key: 'PORT', value: '3000' },
          { key: 'HOST', value: '0.0.0.0' }
        ],
        health_check_enabled: true,
        health_check_path: '/health',
        health_check_port: '3000',
        health_check_interval: 30,
        health_check_timeout: 10,
        health_check_retries: 3,
        auto_deploy: true,
        auto_deploy_webhook: true
      });
      
      console.log(chalk.green(`✓ Created SvelteKit application service: ${serviceName}`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create SvelteKit service: ${error.response?.data?.message || error.message}`));
      throw error;
    }
  }

  async getServiceWebhook(projectId: string, serviceId: string): Promise<string | null> {
    try {
      const response = await this.client.get(`/api/v1/projects/${projectId}/applications/${serviceId}`);
      const webhook = response.data?.webhook_url || response.data?.auto_deploy_webhook_url;
      return webhook || null;
    } catch (error: any) {
      console.error(chalk.yellow(`Warning: Could not retrieve webhook URL: ${error.response?.data?.message || error.message}`));
      return null;
    }
  }

  async createPocketBaseService(projectId: string): Promise<CoolifyService> {
    try {
      const response = await this.client.post(`/api/v1/projects/${projectId}/applications`, {
        name: 'pocketbase',
        docker_image: 'ghcr.io/muchobien/pocketbase:latest',
        ports_exposes: '8090',
        environment_variables: [
          { key: 'POCKETBASE_DATA_DIR', value: '/pb_data' },
          { key: 'POCKETBASE_PUBLIC_DIR', value: '/pb_public' }
        ],
        volumes: [
          {
            source: 'pocketbase_data',
            target: '/pb_data',
            type: 'volume'
          },
          {
            source: 'pocketbase_public',
            target: '/pb_public',
            type: 'volume'
          }
        ],
        health_check_enabled: true,
        health_check_path: '/api/health',
        health_check_port: '8090'
      });
      
      console.log(chalk.green(`✓ Created PocketBase service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create PocketBase service: ${error.response?.data?.message || error.message}`));
      throw error;
    }
  }

  async createRedisService(projectId: string): Promise<CoolifyService> {
    try {
      const response = await this.client.post(`/api/v1/projects/${projectId}/applications`, {
        name: 'redis',
        docker_image: 'redis:alpine',
        ports_exposes: '6379',
        environment_variables: [
          { key: 'REDIS_PASSWORD', value: 'redis123' }
        ],
        command: 'redis-server --requirepass $REDIS_PASSWORD',
        volumes: [
          {
            source: 'redis_data',
            target: '/data',
            type: 'volume'
          }
        ],
        health_check_enabled: true,
        health_check_command: 'redis-cli -a $REDIS_PASSWORD ping',
        restart_policy: 'unless-stopped'
      });
      
      console.log(chalk.green(`✓ Created Redis service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create Redis service: ${error.response?.data?.message || error.message}`));
      throw error;
    }
  }

  async createLiteLLMService(projectId: string): Promise<CoolifyService> {
    try {
      const response = await this.client.post(`/api/v1/projects/${projectId}/applications`, {
        name: 'litellm',
        docker_image: 'ghcr.io/berriai/litellm:main-stable',
        ports_exposes: '4000',
        environment_variables: [
          { key: 'MASTER_KEY', value: 'your-master-key-here' },
          { key: 'PORT', value: '4000' },
          { key: 'DROP_PARAMS', value: 'true' }
        ],
        volumes: [
          {
            source: 'litellm_config',
            target: '/app/config.yaml',
            type: 'bind'
          }
        ]
      });
      
      console.log(chalk.green(`✓ Created LiteLLM service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create LiteLLM service: ${error.response?.data?.message || error.message}`));
      throw error;
    }
  }

  async createQdrantService(projectId: string): Promise<CoolifyService> {
    try {
      const response = await this.client.post(`/api/v1/projects/${projectId}/applications`, {
        name: 'qdrant',
        docker_image: 'qdrant/qdrant:latest',
        ports_exposes: '6333',
        environment_variables: [
          { key: 'QDRANT__SERVICE__HTTP_PORT', value: '6333' },
          { key: 'QDRANT__SERVICE__GRPC_PORT', value: '6334' }
        ],
        volumes: [
          {
            source: 'qdrant_storage',
            target: '/qdrant/storage',
            type: 'volume'
          }
        ]
      });
      
      console.log(chalk.green(`✓ Created Qdrant vector database service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create Qdrant service: ${error.response?.data?.message || error.message}`));
      throw error;
    }
  }

  async createMongoDBService(projectId: string): Promise<CoolifyService> {
    try {
      const response = await this.client.post(`/api/v1/projects/${projectId}/applications`, {
        name: 'mongodb',
        docker_image: 'mongo:latest',
        ports_exposes: '27017',
        environment_variables: [
          { key: 'MONGO_INITDB_ROOT_USERNAME', value: 'admin' },
          { key: 'MONGO_INITDB_ROOT_PASSWORD', value: 'admin123' },
          { key: 'MONGO_INITDB_DATABASE', value: 'app' }
        ],
        volumes: [
          {
            source: 'mongodb_data',
            target: '/data/db',
            type: 'volume'
          }
        ]
      });
      
      console.log(chalk.green(`✓ Created MongoDB service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create MongoDB service: ${error.response?.data?.message || error.message}`));
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
      const response = await this.client.post(`/api/v1/projects/${projectId}/networks`, {
        name: networkName,
        driver: 'bridge',
        attachable: true
      });
      
      console.log(chalk.green(`✓ Created project network: ${networkName}`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create network: ${error.response?.data?.message || error.message}`));
      throw error;
    }
  }

  async linkServicesToNetwork(projectId: string, serviceIds: string[], networkName: string = 'app-network'): Promise<void> {
    try {
      for (const serviceId of serviceIds) {
        await this.client.post(`/api/v1/projects/${projectId}/services/${serviceId}/networks`, {
          network_name: networkName
        });
      }
      
      console.log(chalk.green(`✓ Linked ${serviceIds.length} services to network: ${networkName}`));
    } catch (error: any) {
      console.error(chalk.red(`Failed to link services to network: ${error.response?.data?.message || error.message}`));
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
      // Create project network for service communication
      console.log(chalk.blue('Creating project network...'));
      const network = await this.createProjectNetwork(projectId);
      
      // Create SvelteKit app if requested
      if (options.includeSvelteKit && options.dockerImage) {
        console.log(chalk.blue('Creating SvelteKit application...'));
        const svelteKitService = await this.createSvelteKitService(projectId, 'app', options.dockerImage);
        services.push(svelteKitService);
      }
      
      // Create database service
      if (options.includeDatabase === 'pocketbase') {
        console.log(chalk.blue('Creating PocketBase database...'));
        const pocketbaseService = await this.createPocketBaseService(projectId);
        services.push(pocketbaseService);
      } else if (options.includeDatabase === 'mongodb') {
        console.log(chalk.blue('Creating MongoDB database...'));
        const mongoService = await this.createMongoDBService(projectId);
        services.push(mongoService);
      }
      
      // Create Redis cache if requested
      if (options.includeRedis) {
        console.log(chalk.blue('Creating Redis cache...'));
        const redisService = await this.createRedisService(projectId);
        services.push(redisService);
      }
      
      // Create additional services
      for (const serviceType of options.includeServices) {
        if (serviceType === 'litellm') {
          console.log(chalk.blue('Creating LiteLLM AI Gateway...'));
          const litellmService = await this.createLiteLLMService(projectId);
          services.push(litellmService);
        } else if (serviceType === 'qdrant') {
          console.log(chalk.blue('Creating Qdrant vector database...'));
          const qdrantService = await this.createQdrantService(projectId);
          services.push(qdrantService);
        }
      }
      
      // Link all services to the network
      if (services.length > 0) {
        const serviceIds = services.map(s => s.id);
        await this.linkServicesToNetwork(projectId, serviceIds);
      }
      
      console.log(chalk.green(`✅ Successfully created ${services.length} services with networking configured`));
      
      return { services, network };
      
    } catch (error: any) {
      console.error(chalk.red('Failed to setup complete project infrastructure:'), error.message);
      throw error;
    }
  }
}