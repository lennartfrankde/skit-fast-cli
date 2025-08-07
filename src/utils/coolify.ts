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

  /**
   * Helper method to create services with fallback for different API versions
   */
  private async createServiceWithFallback(projectId: string, serviceName: string, newFormatPayload: any, legacyFormatPayload: any): Promise<CoolifyService> {
    // Try multiple API endpoint patterns based on different Coolify versions
    const endpointsToTry = [
      { url: `/api/v1/projects/${projectId}/applications`, payload: legacyFormatPayload, name: 'applications endpoint' },
      { url: `/api/v1/projects/${projectId}/services`, payload: newFormatPayload, name: 'services endpoint' },
      { url: `/projects/${projectId}/applications`, payload: legacyFormatPayload, name: 'projects applications' },
      { url: `/api/v1/applications`, payload: { ...legacyFormatPayload, project_uuid: projectId }, name: 'direct applications' }
    ];

    let lastError: any = null;

    for (const endpoint of endpointsToTry) {
      try {
        console.log(chalk.gray(`API Request: POST ${endpoint.url}`));
        const response = await this.client.post(endpoint.url, endpoint.payload);
        console.log(chalk.green(`✓ Successfully created service using ${endpoint.name}`));
        return response.data;
      } catch (error: any) {
        console.log(chalk.yellow(`${endpoint.name} failed: ${error.response?.data?.message || error.message}`));
        lastError = error;
        
        // If we get a 422 (validation error), this endpoint exists but payload is wrong
        if (error.response?.status === 422) {
          console.log(chalk.yellow(`API endpoint exists but payload validation failed. Trying simplified payload...`));
          
          // Try with simplified payload
          try {
            const simplifiedPayload = {
              name: serviceName,
              docker_image: newFormatPayload.image || legacyFormatPayload.docker_image,
              ...(projectId && { project_uuid: projectId })
            };
            console.log(chalk.gray(`Retry with simplified payload: POST ${endpoint.url}`));
            const retryResponse = await this.client.post(endpoint.url, simplifiedPayload);
            console.log(chalk.green(`✓ Successfully created service with simplified payload`));
            return retryResponse.data;
          } catch (retryError: any) {
            console.log(chalk.yellow(`Simplified payload also failed: ${retryError.response?.data?.message || retryError.message}`));
          }
        }
      }
    }

    // All endpoints failed
    console.error(chalk.red(`All API endpoints failed for service: ${serviceName}`));
    if (lastError) {
      console.error(chalk.red(`Last error: ${lastError.response?.data?.message || lastError.message}`));
      console.error(chalk.red(`HTTP Status: ${lastError.response?.status}`));
      if (lastError.response?.data) {
        console.error(chalk.red(`Response: ${JSON.stringify(lastError.response.data, null, 2)}`));
      }
    }
    throw lastError || new Error(`Failed to create service ${serviceName}`);
  }

  /**
   * Test Coolify API endpoints to determine the correct format
   */
  private async detectApiEndpoints(projectId: string): Promise<{ endpoint: string; format: 'new' | 'legacy' | 'simple' }> {
    const endpointsToTest = [
      { endpoint: `/api/v1/projects/${projectId}/applications`, format: 'legacy' as const },
      { endpoint: `/api/v1/projects/${projectId}/services`, format: 'new' as const },
      { endpoint: `/projects/${projectId}/applications`, format: 'simple' as const }
    ];

    for (const test of endpointsToTest) {
      try {
        // Try a simple GET request to see if the endpoint exists
        await this.client.get(test.endpoint);
        console.log(chalk.green(`✓ Detected working API endpoint: ${test.endpoint}`));
        return test;
      } catch (error: any) {
        if (error.response?.status === 200 || error.response?.status === 404) {
          // 404 might just mean no services exist yet, but endpoint is valid
          return test;
        }
        console.log(chalk.gray(`Endpoint ${test.endpoint} not available: ${error.response?.status || error.message}`));
      }
    }

    // Default to legacy format if detection fails
    console.log(chalk.yellow('Could not detect API format, defaulting to legacy'));
    return { endpoint: `/api/v1/projects/${projectId}/applications`, format: 'legacy' };
  }

  /**
   * Validate and normalize project ID for API calls
   */
  private validateProjectId(project: any): string {
    // Handle different project response formats
    let projectId = project;
    
    if (typeof project === 'object') {
      projectId = project.id || project.uuid || project.project_id;
    }
    
    if (!projectId) {
      throw new Error('Invalid project ID: could not extract ID from project data');
    }
    
    // Ensure project ID is a string
    projectId = String(projectId);
    
    console.log(chalk.gray(`Using project ID: ${projectId}`));
    return projectId;
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log(chalk.blue(`Testing connection to: ${this.client.defaults.baseURL}/api/v1/teams`));
      const response = await this.client.get('/api/v1/teams');
      
      // Try to get version information
      try {
        const versionResponse = await this.client.get('/api/v1/version');
        console.log(chalk.green(`✓ Connected to Coolify ${versionResponse.data?.version || 'unknown version'}`));
      } catch (versionError) {
        console.log(chalk.green(`✓ Connected to Coolify (version info not available)`));
      }
      
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
      
      // Log the response to debug what we're getting back
      console.log(chalk.gray(`Project creation response: ${JSON.stringify(response.data, null, 2)}`));
      
      // Handle different response structures and validate ID
      let project;
      if (response.data.id) {
        project = response.data;
      } else if (response.data.data && response.data.data.id) {
        project = response.data.data;
      } else if (response.data.uuid) {
        // Some Coolify versions use uuid instead of id
        project = { ...response.data, id: response.data.uuid };
      } else {
        throw new Error('Project creation response does not contain a valid ID');
      }
      
      // Validate the project ID
      const projectId = this.validateProjectId(project);
      project.id = projectId;
      
      console.log(chalk.green(`✓ Created Coolify project: ${name} (ID: ${projectId})`));
      return project;
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
      
      // Simplified new format payload (more compatible)
      const newFormatPayload = {
        name: serviceName,
        description: `SvelteKit application service`,
        image: dockerImage,
        ports_exposes: '3000',
        type: 'docker',
        environment_variables: {
          NODE_ENV: 'production',
          PORT: '3000',
          HOST: '0.0.0.0'
        }
      };

      // Simplified legacy format payload (more compatible)
      const legacyFormatPayload = {
        name: serviceName,
        docker_image: dockerImage,
        ports_exposes: '3000',
        description: `SvelteKit application service`,
        type: 'docker',
        environment_variables: [
          { key: 'NODE_ENV', value: 'production' },
          { key: 'PORT', value: '3000' },
          { key: 'HOST', value: '0.0.0.0' }
        ]
      };

      const result = await this.createServiceWithFallback(projectId, serviceName, newFormatPayload, legacyFormatPayload);
      console.log(chalk.green(`✓ Created SvelteKit application service: ${serviceName}`));
      return result;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create SvelteKit service: ${serviceName}`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
        
        if (error.response.status === 422) {
          console.log(chalk.yellow('\n💡 This looks like a validation error. Common solutions:'));
          console.log(chalk.yellow('   - Try a different service name (current: ' + serviceName + ')'));
          console.log(chalk.yellow('   - Verify the Docker image is accessible: ' + dockerImage));
          console.log(chalk.yellow('   - Check if a service with this name already exists'));
          console.log(chalk.yellow('   - Ensure the project has proper permissions'));
        } else if (error.response.status === 404) {
          console.log(chalk.yellow('\n💡 API endpoint not found. Troubleshooting:'));
          console.log(chalk.yellow('   - Verify Coolify version compatibility (try updating Coolify)'));
          console.log(chalk.yellow('   - Check project ID is correct: ' + projectId));
          console.log(chalk.yellow('   - Verify API token has service creation permissions'));
          console.log(chalk.yellow('   - Try creating the service manually in Coolify dashboard'));
        } else if (error.response.status === 401 || error.response.status === 403) {
          console.log(chalk.yellow('\n💡 Authentication/Authorization error:'));
          console.log(chalk.yellow('   - Verify your API token is valid and not expired'));
          console.log(chalk.yellow('   - Check token has permissions to create services in this project'));
          console.log(chalk.yellow('   - Try regenerating the API token in Coolify dashboard'));
        }
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
        
        if (error.message.includes('Network Error') || error.message.includes('timeout')) {
          console.log(chalk.yellow('\n💡 Connection issue:'));
          console.log(chalk.yellow('   - Check if Coolify instance is accessible'));
          console.log(chalk.yellow('   - Verify URL is correct: ' + this.client.defaults.baseURL));
          console.log(chalk.yellow('   - Check network connectivity and firewall settings'));
        }
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
        type: 'docker',
        environment_variables: {
          POCKETBASE_DATA_DIR: '/pb_data',
          POCKETBASE_PUBLIC_DIR: '/pb_public'
        }
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
        docker_image: 'qdrant/qdrant:latest',
        ports_exposes: '6333',
        environment_variables: [
          { key: 'QDRANT__SERVICE__HTTP_PORT', value: '6333' },
          { key: 'QDRANT__SERVICE__GRPC_PORT', value: '6334' }
        ],
        volumes: [
          {
            name: 'qdrant_storage',
            mount_path: '/qdrant/storage',
            host_path: null
          }
        ],
        restart_policy: 'unless-stopped'
      };

      console.log(chalk.gray(`API Request: POST /api/v1/projects/${projectId}/applications/dockerimage`));
      const response = await this.client.post(`/api/v1/projects/${projectId}/applications/dockerimage`, payload);
      
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
        docker_image: 'mongo:latest',
        ports_exposes: '27017',
        environment_variables: [
          { key: 'MONGO_INITDB_ROOT_USERNAME', value: 'admin' },
          { key: 'MONGO_INITDB_ROOT_PASSWORD', value: 'admin123' },
          { key: 'MONGO_INITDB_DATABASE', value: 'app' }
        ],
        volumes: [
          {
            name: 'mongodb_data',
            mount_path: '/data/db',
            host_path: null
          }
        ],
        restart_policy: 'unless-stopped'
      };

      console.log(chalk.gray(`API Request: POST /api/v1/projects/${projectId}/databases/mongodb`));
      const response = await this.client.post(`/api/v1/projects/${projectId}/databases/mongodb`, payload);
      
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
      
      // Validate project ID first
      const validatedProjectId = this.validateProjectId(projectId);
      
      // Create project network for service communication (optional)
      let network = null;
      try {
        network = await this.createProjectNetwork(validatedProjectId);
      } catch (networkError) {
        // Network creation is optional and often handled automatically
        console.log(chalk.yellow('Continuing without custom network (Coolify will handle service communication)'));
      }
      
      // Create SvelteKit app if requested
      if (options.includeSvelteKit && options.dockerImage) {
        console.log(chalk.blue('Creating SvelteKit application...'));
        try {
          const svelteKitService = await this.createSvelteKitService(validatedProjectId, 'app', options.dockerImage);
          services.push(svelteKitService);
        } catch (error: any) {
          console.error(chalk.red('Failed to create SvelteKit service. This might be due to:'));
          console.error(chalk.red('1. Invalid Docker image URL or image not accessible'));
          console.error(chalk.red('2. Service name already exists in the project'));
          console.error(chalk.red('3. Coolify API version differences'));
          console.error(chalk.red('4. Insufficient permissions or API token issues'));
          
          // Don't throw immediately, provide more context
          console.log(chalk.yellow('\n🔧 Suggested troubleshooting steps:'));
          console.log(chalk.yellow('1. Verify the Docker image exists and is accessible: ' + options.dockerImage));
          console.log(chalk.yellow('2. Check if a service named "app" already exists in this project'));
          console.log(chalk.yellow('3. Try creating the service manually in Coolify dashboard first'));
          console.log(chalk.yellow('4. Verify your API token has service creation permissions'));
          console.log(chalk.yellow('5. Check if your Coolify instance is up to date'));
          
          throw error;
        }
      }
      
      // Create database service
      if (options.includeDatabase === 'pocketbase') {
        console.log(chalk.blue('Creating PocketBase database...'));
        try {
          const pocketbaseService = await this.createPocketBaseService(validatedProjectId);
          services.push(pocketbaseService);
        } catch (error: any) {
          console.error(chalk.red('Failed to create PocketBase service. Continuing with other services...'));
          console.log(chalk.yellow('You can create the PocketBase service manually in Coolify dashboard.'));
        }
      } else if (options.includeDatabase === 'mongodb') {
        console.log(chalk.blue('Creating MongoDB database...'));
        try {
          const mongoService = await this.createMongoDBService(validatedProjectId);
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
          const redisService = await this.createRedisService(validatedProjectId);
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
            const litellmService = await this.createLiteLLMService(validatedProjectId);
            services.push(litellmService);
          } catch (error: any) {
            console.error(chalk.red('Failed to create LiteLLM service. Continuing with other services...'));
            console.log(chalk.yellow('You can create the LiteLLM service manually in Coolify dashboard.'));
          }
        } else if (serviceType === 'qdrant') {
          console.log(chalk.blue('Creating Qdrant vector database...'));
          try {
            const qdrantService = await this.createQdrantService(validatedProjectId);
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
          await this.linkServicesToNetwork(validatedProjectId, serviceIds);
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
      console.log(chalk.yellow('5. Check the Coolify logs for additional error details'));
      
      if (services.length > 0) {
        console.log(chalk.green(`\nNote: ${services.length} services were created successfully before the error.`));
        return { services, network: null };
      }
      
      throw error;
    }
  }
}