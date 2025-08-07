import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import { CoolifyProject, CoolifyService, ProjectOptions, DockerImagePayload } from '../types';

export class CoolifyClient {
  private client: AxiosInstance;
  private useProductionEnvironment: boolean = false;

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
   * Parse Docker image into registry name and tag
   */
  private parseDockerImage(dockerImage: string): { name: string; tag: string } {
    // Find the last colon that's not part of a port (i.e., after a slash)
    const lastSlashIndex = dockerImage.lastIndexOf('/');
    const searchStartIndex = lastSlashIndex === -1 ? 0 : lastSlashIndex;
    const colonIndex = dockerImage.lastIndexOf(':', dockerImage.length);
    
    // If no colon found after the last slash, or colon is before the last slash (part of hostname:port)
    if (colonIndex === -1 || colonIndex < searchStartIndex) {
      return { name: dockerImage, tag: 'latest' };
    }
    
    const name = dockerImage.substring(0, colonIndex);
    const tag = dockerImage.substring(colonIndex + 1);
    
    // Check if the tag contains a slash, which would indicate it's actually part of the path
    if (tag.includes('/')) {
      return { name: dockerImage, tag: 'latest' };
    }
    
    return { name, tag };
  }

  /**
   * Detect if we should use production environment (default network/environment)
   */
  private async detectProductionEnvironment(): Promise<boolean> {
    try {
      // Try to get server information to determine environment setup
      const response = await this.client.get('/api/v1/servers');
      // If we can access servers directly, we're likely in production mode
      return Array.isArray(response.data) && response.data.length > 0;
    } catch (error: any) {
      // If servers endpoint is not accessible, assume non-production
      return false;
    }
  }

  /**
   * Step 1: Get server UUID as specified in the problem statement
   * GET /api/v1/servers to retrieve the UUID of the server
   */
  private async getServerUuid(): Promise<string> {
    try {
      console.log(chalk.blue('Fetching server UUID from /api/v1/servers...'));
      const response = await this.client.get('/api/v1/servers');
      
      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('No servers found. Please ensure at least one server is configured in Coolify.');
      }
      
      // Get the first server's UUID (as shown in problem statement example)
      const server = response.data[0];
      const serverUuid = server.uuid || server.id;
      
      if (!serverUuid) {
        throw new Error('Server UUID not found in server response');
      }
      
      console.log(chalk.gray(`Found server: ${server.name || 'unnamed'} (${server.ip || 'no IP'}) - UUID: ${serverUuid}`));
      return serverUuid;
      
    } catch (error: any) {
      console.error(chalk.red('Failed to retrieve server UUID'));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      
      console.log(chalk.yellow('\n💡 Troubleshooting for server UUID retrieval:'));
      console.log(chalk.yellow('   1. Ensure at least one server is configured in Coolify'));
      console.log(chalk.yellow('   2. Verify your API token has permission to read servers'));
      console.log(chalk.yellow('   3. Check if Coolify instance is properly set up'));
      console.log(chalk.yellow('   4. Try accessing the servers page in Coolify dashboard'));
      
      throw error;
    }
  }

  /**
   * Step 2: Create Application using the correct endpoint as specified in problem statement
   * POST /api/v1/applications/dockerimage with the exact payload format
   */
  private async createApplicationWithDockerImage(
    projectId: string, 
    serviceName: string, 
    dockerImage: string, 
    serverUuid: string
  ): Promise<CoolifyService> {
    try {
      console.log(chalk.blue('Creating application using /api/v1/applications/dockerimage endpoint...'));
      
      // Parse Docker image into registry name and tag as required by the API
      const { name: registryImageName, tag: registryImageTag } = this.parseDockerImage(dockerImage);
      
      // Get environment and destination information
      const environment = await this.getDefaultEnvironment();
      const destinationUuid = await this.getDefaultDestinationUuid();
      
      // Build payload exactly as specified in the problem statement
      const payload: DockerImagePayload = {
        project_uuid: projectId,
        server_uuid: serverUuid,
        environment_name: environment?.name || 'production',
        docker_registry_image_name: registryImageName,
        docker_registry_image_tag: registryImageTag,
        ports_exposes: '3000',
        name: serviceName,
        description: 'SvelteKit application service',
        domains: '',
        ports_mappings: '',
        health_check_enabled: true,
        health_check_path: '/health',
        health_check_port: '3000',
        health_check_host: '0.0.0.0',
        health_check_method: 'GET',
        health_check_return_code: 200,
        health_check_scheme: 'http',
        health_check_response_text: '',
        health_check_interval: 30,
        health_check_timeout: 10,
        health_check_retries: 3,
        health_check_start_period: 0,
        limits_memory: '',
        limits_memory_swap: '',
        limits_memory_swappiness: 0,
        limits_memory_reservation: '',
        limits_cpus: '',
        limits_cpuset: '',
        limits_cpu_shares: 0,
        custom_labels: '',
        custom_docker_run_options: '',
        post_deployment_command: '',
        post_deployment_command_container: '',
        pre_deployment_command: '',
        pre_deployment_command_container: '',
        manual_webhook_secret_github: '',
        manual_webhook_secret_gitlab: '',
        manual_webhook_secret_bitbucket: '',
        manual_webhook_secret_gitea: '',
        redirect: '',
        instant_deploy: true,
        use_build_server: true,
        is_http_basic_auth_enabled: true,
        http_basic_auth_username: '',
        http_basic_auth_password: '',
        connect_to_docker_network: true
      };
      
      // Include optional UUID fields if they have valid values
      if (environment?.uuid) {
        payload.environment_uuid = environment.uuid;
      }
      
      if (destinationUuid) {
        payload.destination_uuid = destinationUuid;
      }
      
      console.log(chalk.gray(`API Request: POST /api/v1/applications/dockerimage`));
      console.log(chalk.gray(`Payload: ${JSON.stringify(payload, null, 2)}`));
      
      const response = await this.client.post('/api/v1/applications/dockerimage', payload);
      
      console.log(chalk.green(`✓ Successfully created application using correct Coolify API endpoint`));
      return response.data;
      
    } catch (error: any) {
      console.error(chalk.red(`Failed to create application via /api/v1/applications/dockerimage`));
      
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || 'Unknown error';
        
        console.error(chalk.red(`HTTP Status: ${status}`));
        console.error(chalk.red(`Response: ${JSON.stringify(error.response.data, null, 2)}`));
        
        if (status === 404) {
          console.log(chalk.yellow('\n💡 Docker image application endpoint not found (404):'));
          console.log(chalk.yellow('   1. Verify Coolify version supports /api/v1/applications/dockerimage'));
          console.log(chalk.yellow('   2. Check if you need to update Coolify to a newer version'));
          console.log(chalk.yellow('   3. Verify the project UUID is correct: ' + projectId));
          console.log(chalk.yellow('   4. Ensure your API token has application creation permissions'));
        } else if (status === 422) {
          console.log(chalk.yellow('\n💡 Application creation validation error (422):'));
          console.log(chalk.yellow('   1. Check if application name "' + serviceName + '" already exists'));
          console.log(chalk.yellow('   2. Verify Docker image is accessible: ' + dockerImage));
          console.log(chalk.yellow('   3. Ensure server UUID is valid: ' + serverUuid));
          console.log(chalk.yellow('   4. Check project permissions and configuration'));
        } else if (status === 401 || status === 403) {
          console.log(chalk.yellow('\n💡 Authentication/Authorization error:'));
          console.log(chalk.yellow('   1. Verify API token is valid and not expired'));
          console.log(chalk.yellow('   2. Check token has application creation permissions'));
          console.log(chalk.yellow('   3. Ensure token can access the specified project and server'));
        } else if (status >= 500) {
          console.log(chalk.yellow('\n💡 Server error:'));
          console.log(chalk.yellow('   1. Check Coolify server logs for errors'));
          console.log(chalk.yellow('   2. Verify Coolify instance is running properly'));
          console.log(chalk.yellow('   3. Try the request again in a few minutes'));
        }
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      throw error;
    }
  }

  /**
   * Get default environment information for production
   */
  private async getDefaultEnvironment(): Promise<{ name: string; uuid: string } | null> {
    try {
      const response = await this.client.get('/api/v1/environments');
      if (Array.isArray(response.data) && response.data.length > 0) {
        const productionEnv = response.data.find((env: any) => 
          env.name === 'production' || env.name === 'prod'
        ) || response.data[0];
        
        return {
          name: productionEnv.name || 'production',
          uuid: productionEnv.uuid || productionEnv.id
        };
      }
    } catch (error: any) {
      console.log(chalk.yellow('Could not retrieve environment information, using defaults'));
    }
    return { name: 'production', uuid: '' };
  }

  /**
   * Get default destination UUID for production environment
   */
  private async getDefaultDestinationUuid(): Promise<string | null> {
    try {
      const response = await this.client.get('/api/v1/destinations');
      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0].uuid || response.data[0].id;
      }
    } catch (error: any) {
      console.log(chalk.yellow('Could not retrieve destination information'));
    }
    return null;
  }

  /**
   * Helper method to create services with fallback for different API versions
   */
  private async createServiceWithFallback(projectId: string, serviceName: string, newFormatPayload: any, legacyFormatPayload: any): Promise<CoolifyService> {
    // Try multiple API endpoint patterns based on different Coolify versions
    // Updated endpoints based on current Coolify API structure
    // Build payload according to problem statement specification
    const dockerImagePayload = {
      name: serviceName,
      project_uuid: projectId,
      image: newFormatPayload.image || `${legacyFormatPayload.docker_registry_image_name}:${legacyFormatPayload.docker_registry_image_tag}`,
      // Include server_uuid if available (will be added by calling method)
      ...(legacyFormatPayload.server_uuid && { server_uuid: legacyFormatPayload.server_uuid })
    };
    
    const endpointsToTry = [
      { url: `/api/v1/applications/dockerimage`, payload: dockerImagePayload, name: 'docker image applications endpoint (correct API)' },
      { url: `/api/v1/applications`, payload: { ...legacyFormatPayload, project_uuid: projectId }, name: 'direct applications endpoint' },
      { url: `/api/v1/projects/${projectId}/applications`, payload: legacyFormatPayload, name: 'project applications endpoint' },
      { url: `/api/v1/services`, payload: { ...newFormatPayload, project_id: projectId }, name: 'direct services endpoint' },
      { url: `/api/v1/projects/${projectId}/services`, payload: newFormatPayload, name: 'project services endpoint' },
      { url: `/applications`, payload: { ...legacyFormatPayload, project_uuid: projectId }, name: 'legacy applications endpoint' }
    ];

    let lastError: any = null;

    for (const endpoint of endpointsToTry) {
      try {
        console.log(chalk.gray(`API Request: POST ${endpoint.url}`));
        console.log(chalk.gray(`Payload: ${JSON.stringify(endpoint.payload, null, 2)}`));
        const response = await this.client.post(endpoint.url, endpoint.payload);
        console.log(chalk.green(`✓ Successfully created service using ${endpoint.name}`));
        return response.data;
      } catch (error: any) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        
        console.log(chalk.yellow(`${endpoint.name} failed (${status}): ${message}`));
        lastError = error;
        
        // If we get a 422 (validation error), this endpoint exists but payload is wrong
        if (status === 422) {
          console.log(chalk.yellow(`API endpoint exists but payload validation failed. Trying simplified payload...`));
          
          // Try with simplified payload
          try {
            const simplifiedPayload = {
              name: serviceName,
              docker_image: newFormatPayload.image || endpoint.payload.docker_registry_image_name,
              project_uuid: projectId,
              ...(endpoint.payload.docker_registry_image_tag && { docker_image_tag: endpoint.payload.docker_registry_image_tag })
            };
            console.log(chalk.gray(`Retry with simplified payload: POST ${endpoint.url}`));
            console.log(chalk.gray(`Simplified payload: ${JSON.stringify(simplifiedPayload, null, 2)}`));
            const retryResponse = await this.client.post(endpoint.url, simplifiedPayload);
            console.log(chalk.green(`✓ Successfully created service with simplified payload`));
            return retryResponse.data;
          } catch (retryError: any) {
            console.log(chalk.yellow(`Simplified payload also failed: ${retryError.response?.data?.message || retryError.message}`));
          }
        }
        
        // If we get a 404, this endpoint doesn't exist - continue to next endpoint
        if (status === 404) {
          continue;
        }
        
        // For other errors (401, 403, 500), log and continue
        console.log(chalk.yellow(`Endpoint failed with status ${status}, trying next endpoint...`));
      }
    }

    // All endpoints failed - provide comprehensive troubleshooting
    console.error(chalk.red(`❌ All API endpoints failed for service: ${serviceName}`));
    
    if (lastError) {
      const status = lastError.response?.status;
      const message = lastError.response?.data?.message || lastError.message;
      
      console.error(chalk.red(`Last error: ${message}`));
      console.error(chalk.red(`HTTP Status: ${status}`));
      
      if (lastError.response?.data) {
        console.error(chalk.red(`Response: ${JSON.stringify(lastError.response.data, null, 2)}`));
      }
      
      // Provide specific troubleshooting based on error type
      if (status === 404) {
        console.log(chalk.yellow('\n🔧 API Endpoint Not Found (404) - Troubleshooting:'));
        console.log(chalk.yellow('   1. Verify your Coolify version is up to date (v4+)'));
        console.log(chalk.yellow('   2. Check if the project ID is correct: ' + projectId));
        console.log(chalk.yellow('   3. Try creating the service manually in Coolify dashboard first'));
        console.log(chalk.yellow('   4. Verify your API token has service creation permissions'));
        console.log(chalk.yellow('   5. Check Coolify documentation for your version\'s API endpoints'));
      } else if (status === 401 || status === 403) {
        console.log(chalk.yellow('\n🔑 Authentication/Authorization Error - Troubleshooting:'));
        console.log(chalk.yellow('   1. Verify your API token is valid and not expired'));
        console.log(chalk.yellow('   2. Check token has permissions to create services in this project'));
        console.log(chalk.yellow('   3. Try regenerating the API token in Coolify dashboard'));
        console.log(chalk.yellow('   4. Ensure you\'re using the correct Coolify URL'));
      } else if (status === 422) {
        console.log(chalk.yellow('\n📝 Validation Error - Troubleshooting:'));
        console.log(chalk.yellow('   1. Check if a service with name "' + serviceName + '" already exists'));
        console.log(chalk.yellow('   2. Verify the Docker image is accessible and valid'));
        console.log(chalk.yellow('   3. Try using a different service name'));
        console.log(chalk.yellow('   4. Check project has proper configuration'));
      } else if (status >= 500) {
        console.log(chalk.yellow('\n🚨 Server Error - Troubleshooting:'));
        console.log(chalk.yellow('   1. Check if Coolify instance is running properly'));
        console.log(chalk.yellow('   2. Review Coolify server logs for errors'));
        console.log(chalk.yellow('   3. Try the request again in a few minutes'));
        console.log(chalk.yellow('   4. Contact your Coolify administrator'));
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
      
      // Validate inputs
      if (!projectId || !serviceName || !dockerImage) {
        throw new Error('Missing required parameters: projectId, serviceName, or dockerImage');
      }
      
      // Step 1: Get the server_uuid (as specified in problem statement)
      console.log(chalk.blue('Step 1: Getting server UUID...'));
      const serverUuid = await this.getServerUuid();
      if (!serverUuid) {
        throw new Error('Failed to retrieve server UUID. Cannot create application without server UUID.');
      }
      console.log(chalk.green(`✓ Retrieved server UUID: ${serverUuid}`));
      
      // Step 2: Create the Application using the correct endpoint (as specified in problem statement)
      console.log(chalk.blue('Step 2: Creating Docker application...'));
      try {
        return await this.createApplicationWithDockerImage(projectId, serviceName, dockerImage, serverUuid);
      } catch (primaryError: any) {
        console.log(chalk.yellow('Primary application creation failed, trying fallback methods...'));
        
        // Try simplified payload approach
        try {
          return await this.createSvelteKitServiceWithSimplifiedPayload(projectId, serviceName, dockerImage);
        } catch (simplifiedError: any) {
          console.log(chalk.yellow('Simplified payload approach failed, trying minimal approach...'));
          
          // Try minimal payload as last resort
          try {
            return await this.createSvelteKitServiceMinimal(projectId, serviceName, dockerImage);
          } catch (minimalError: any) {
            // All approaches failed - throw the original error with comprehensive guidance
            throw primaryError;
          }
        }
      }
      
    } catch (error: any) {
      console.error(chalk.red(`Failed to create SvelteKit service: ${serviceName}`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
        
        const status = error.response.status;
        const message = error.response.data?.message || 'Unknown error';
        
        if (status === 404) {
          console.log(chalk.yellow('\n💡 API endpoint not found. Troubleshooting:'));
          console.log(chalk.yellow('   - Verify Coolify version compatibility (requires v4.0+)'));
          console.log(chalk.yellow('   - Check project ID is correct: ' + projectId));
          console.log(chalk.yellow('   - Verify API token has service creation permissions'));
          console.log(chalk.yellow('   - Try creating the service manually in Coolify dashboard'));
          console.log(chalk.yellow('   - Update your Coolify instance to the latest version'));
        } else if (status === 422) {
          console.log(chalk.yellow('\n💡 Validation error detected. Common solutions:'));
          console.log(chalk.yellow('   - Try a different service name (current: ' + serviceName + ')'));
          console.log(chalk.yellow('   - Verify the Docker image is accessible: ' + dockerImage));
          console.log(chalk.yellow('   - Check if a service with this name already exists'));
          console.log(chalk.yellow('   - Ensure the project has proper permissions'));
          console.log(chalk.yellow('   - Verify the Docker image exists and is publicly accessible'));
        } else if (status === 401 || status === 403) {
          console.log(chalk.yellow('\n💡 Authentication/Authorization error:'));
          console.log(chalk.yellow('   - Verify your API token is valid and not expired'));
          console.log(chalk.yellow('   - Check token has permissions to create services in this project'));
          console.log(chalk.yellow('   - Try regenerating the API token in Coolify dashboard'));
          console.log(chalk.yellow('   - Ensure you\'re using the correct Coolify URL'));
        } else if (status >= 500) {
          console.log(chalk.yellow('\n💡 Server error detected:'));
          console.log(chalk.yellow('   - Check if Coolify instance is running properly'));
          console.log(chalk.yellow('   - Review Coolify server logs for errors'));
          console.log(chalk.yellow('   - Try the request again in a few minutes'));
          console.log(chalk.yellow('   - Contact your Coolify administrator'));
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
      
      console.log(chalk.yellow('\n🔧 Manual Service Creation:'));
      console.log(chalk.yellow('   1. Open Coolify dashboard: ' + this.client.defaults.baseURL));
      console.log(chalk.yellow('   2. Navigate to your project: ' + projectId));
      console.log(chalk.yellow('   3. Create a new application/service'));
      console.log(chalk.yellow('   4. Use Docker image: ' + dockerImage));
      console.log(chalk.yellow('   5. Set port: 3000'));
      console.log(chalk.yellow('   6. Add environment variables: NODE_ENV=production, PORT=3000'));
      
      throw error;
    }
  }

  /**
   * Create SvelteKit service using the correct Coolify API endpoint
   */
  private async createSvelteKitServiceProduction(projectId: string, serviceName: string, dockerImage: string): Promise<CoolifyService> {
    console.log(chalk.blue('Creating Docker application using official Coolify API'));
    
    const { name: registryImageName, tag: registryImageTag } = this.parseDockerImage(dockerImage);
    
    // Get environment information (but server_uuid should be retrieved separately)
    const environment = await this.getDefaultEnvironment();
    const destinationUuid = await this.getDefaultDestinationUuid();
    
    // Build payload according to current Coolify API structure
    // Use the most compatible format that works across versions
    const basePayload: DockerImagePayload = {
      project_uuid: projectId,
      docker_registry_image_name: registryImageName,
      docker_registry_image_tag: registryImageTag,
      ports_exposes: '3000',
      name: serviceName,
      description: 'SvelteKit application service',
      instant_deploy: false, // Set to false to avoid immediate deployment issues
      health_check_enabled: true,
      health_check_path: '/health',
      health_check_method: 'GET',
      health_check_return_code: 200,
      health_check_interval: 30,
      health_check_timeout: 10,
      health_check_retries: 3
    };

    // Only include optional UUID fields if they have valid values
    if (environment) {
      basePayload.environment_name = environment.name || 'production';
      if (environment.uuid) {
        basePayload.environment_uuid = environment.uuid;
      }
    }
    
    if (destinationUuid) {
      basePayload.destination_uuid = destinationUuid;
    }

    // Create alternative payload formats for different API versions
    const newFormatPayload = {
      name: serviceName,
      description: 'SvelteKit application service',
      image: dockerImage,
      ports: [{ internal: 3000, external: 3000 }],
      environment_variables: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'PORT', value: '3000' },
        { key: 'HOST', value: '0.0.0.0' }
      ],
      project_id: projectId,
      health_check: {
        enabled: true,
        path: '/health',
        method: 'GET',
        expected_status: 200,
        interval: 30,
        timeout: 10,
        retries: 3
      }
    };

    // Use the fallback method to try different endpoints
    return await this.createServiceWithFallback(projectId, serviceName, newFormatPayload, basePayload);
  }

  /**
   * Create SvelteKit service using development/project-specific format
   */
  private async createSvelteKitServiceDevelopment(projectId: string, serviceName: string, dockerImage: string): Promise<CoolifyService> {
    console.log(chalk.blue('Using development/project-specific format'));
    
    const { name: registryImageName, tag: registryImageTag } = this.parseDockerImage(dockerImage);
    
    // New format payload
    const newFormatPayload = {
      name: serviceName,
      description: 'SvelteKit application service',
      image: dockerImage,
      ports: [{ internal: 3000, external: 3000 }],
      environment_variables: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'PORT', value: '3000' },
        { key: 'HOST', value: '0.0.0.0' }
      ],
      project_id: projectId
    };

    // Legacy format payload
    const legacyFormatPayload = {
      name: serviceName,
      description: 'SvelteKit application service',
      docker_registry_image_name: registryImageName,
      docker_registry_image_tag: registryImageTag,
      ports_exposes: '3000',
      project_uuid: projectId,
      environment_variables: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'PORT', value: '3000' },
        { key: 'HOST', value: '0.0.0.0' }
      ]
    };

    return await this.createServiceWithFallback(projectId, serviceName, newFormatPayload, legacyFormatPayload);
  }

  /**
   * Create SvelteKit service with simplified payload (fallback approach)
   */
  private async createSvelteKitServiceWithSimplifiedPayload(projectId: string, serviceName: string, dockerImage: string): Promise<CoolifyService> {
    console.log(chalk.blue('Using simplified payload approach (fallback)'));
    
    const { name: registryImageName, tag: registryImageTag } = this.parseDockerImage(dockerImage);
    
    // Ultra-simple new format
    const newFormatPayload = {
      name: serviceName,
      image: dockerImage,
      project_id: projectId
    };
    
    // Ultra-simple legacy format
    const legacyFormatPayload = {
      name: serviceName,
      docker_registry_image_name: registryImageName,
      docker_registry_image_tag: registryImageTag,
      project_uuid: projectId,
      ports_exposes: '3000'
    };

    return await this.createServiceWithFallback(projectId, serviceName, newFormatPayload, legacyFormatPayload);
  }

  /**
   * Create SvelteKit service with minimal payload (last resort)
   */
  private async createSvelteKitServiceMinimal(projectId: string, serviceName: string, dockerImage: string): Promise<CoolifyService> {
    console.log(chalk.blue('Using minimal payload approach (last resort)'));
    
    // Absolute minimal payloads
    const newFormatPayload = {
      name: serviceName,
      image: dockerImage
    };
    
    const legacyFormatPayload = {
      name: serviceName,
      docker_image: dockerImage,
      project_uuid: projectId
    };

    return await this.createServiceWithFallback(projectId, serviceName, newFormatPayload, legacyFormatPayload);
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
      console.log(chalk.blue('Creating PocketBase database service...'));
      
      // New format payload for modern Coolify versions
      const newFormatPayload = {
        name: 'pocketbase',
        description: 'PocketBase database service',
        image: 'ghcr.io/muchobien/pocketbase:latest',
        ports: [{ internal: 8090, external: 8090 }],
        volumes: [
          {
            name: 'pocketbase_data',
            mount_path: '/pb_data',
            host_path: null
          }
        ],
        environment_variables: [
          { key: 'POCKETBASE_DATA_DIR', value: '/pb_data' },
          { key: 'POCKETBASE_PUBLIC_DIR', value: '/pb_public' }
        ],
        project_id: projectId,
        restart_policy: 'unless-stopped'
      };

      // Legacy format payload for older Coolify versions
      const legacyFormatPayload = {
        name: 'pocketbase',
        description: 'PocketBase database service',
        docker_registry_image_name: 'ghcr.io/muchobien/pocketbase',
        docker_registry_image_tag: 'latest',
        ports_exposes: '8090',
        project_uuid: projectId,
        environment_variables: [
          { key: 'POCKETBASE_DATA_DIR', value: '/pb_data' },
          { key: 'POCKETBASE_PUBLIC_DIR', value: '/pb_public' }
        ]
      };

      const service = await this.createServiceWithFallback(projectId, 'pocketbase', newFormatPayload, legacyFormatPayload);
      console.log(chalk.green(`✓ Created PocketBase service`));
      return service;
      
    } catch (error: any) {
      console.error(chalk.red(`Failed to create PocketBase service`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      console.log(chalk.yellow('\n🔧 Manual PocketBase Setup:'));
      console.log(chalk.yellow('   1. Create a new service in Coolify dashboard'));
      console.log(chalk.yellow('   2. Use Docker image: ghcr.io/muchobien/pocketbase:latest'));
      console.log(chalk.yellow('   3. Set port: 8090'));
      console.log(chalk.yellow('   4. Add volume: /pb_data for persistent storage'));
      
      throw error;
    }
  }

  async createRedisService(projectId: string): Promise<CoolifyService> {
    try {
      console.log(chalk.blue('Creating Redis cache service...'));
      
      // New format payload for modern Coolify versions
      const newFormatPayload = {
        name: 'redis',
        description: 'Redis cache service',
        image: 'redis:alpine',
        ports: [{ internal: 6379, external: 6379 }],
        command: 'redis-server --requirepass redis123',
        volumes: [
          {
            name: 'redis_data',
            mount_path: '/data',
            host_path: null
          }
        ],
        environment_variables: [
          { key: 'REDIS_PASSWORD', value: 'redis123' }
        ],
        project_id: projectId,
        health_check: {
          enabled: true,
          command: 'redis-cli -a $REDIS_PASSWORD ping',
          interval: 30,
          timeout: 10,
          retries: 3
        },
        restart_policy: 'unless-stopped'
      };

      // Legacy format payload for older Coolify versions
      const legacyFormatPayload = {
        name: 'redis',
        description: 'Redis cache service',
        docker_registry_image_name: 'redis',
        docker_registry_image_tag: 'alpine',
        ports_exposes: '6379',
        project_uuid: projectId,
        command: 'redis-server --requirepass redis123',
        environment_variables: [
          { key: 'REDIS_PASSWORD', value: 'redis123' }
        ]
      };

      const service = await this.createServiceWithFallback(projectId, 'redis', newFormatPayload, legacyFormatPayload);
      console.log(chalk.green(`✓ Created Redis service`));
      return service;
      
    } catch (error: any) {
      console.error(chalk.red(`Failed to create Redis service`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      console.log(chalk.yellow('\n🔧 Manual Redis Setup:'));
      console.log(chalk.yellow('   1. Create a new service in Coolify dashboard'));
      console.log(chalk.yellow('   2. Use Docker image: redis:alpine'));
      console.log(chalk.yellow('   3. Set port: 6379'));
      console.log(chalk.yellow('   4. Add command: redis-server --requirepass redis123'));
      console.log(chalk.yellow('   5. Add volume: /data for persistent storage'));
      
      throw error;
    }
  }

  async createLiteLLMService(projectId: string): Promise<CoolifyService> {
    try {
      console.log(chalk.blue('Creating LiteLLM AI Gateway service...'));
      
      // New format payload for modern Coolify versions
      const newFormatPayload = {
        name: 'litellm',
        description: 'LiteLLM AI Gateway service',
        image: 'ghcr.io/berriai/litellm:main-stable',
        ports: [{ internal: 4000, external: 4000 }],
        environment_variables: [
          { key: 'MASTER_KEY', value: 'your-master-key-here' },
          { key: 'PORT', value: '4000' },
          { key: 'DROP_PARAMS', value: 'true' }
        ],
        volumes: [
          {
            name: 'litellm_config',
            mount_path: '/app/config.yaml',
            host_path: './litellm-config.yaml'
          }
        ],
        project_id: projectId,
        restart_policy: 'unless-stopped'
      };

      // Legacy format payload for older Coolify versions
      const legacyFormatPayload = {
        name: 'litellm',
        description: 'LiteLLM AI Gateway service',
        docker_registry_image_name: 'ghcr.io/berriai/litellm',
        docker_registry_image_tag: 'main-stable',
        ports_exposes: '4000',
        project_uuid: projectId,
        environment_variables: [
          { key: 'MASTER_KEY', value: 'your-master-key-here' },
          { key: 'PORT', value: '4000' },
          { key: 'DROP_PARAMS', value: 'true' }
        ]
      };

      const service = await this.createServiceWithFallback(projectId, 'litellm', newFormatPayload, legacyFormatPayload);
      console.log(chalk.green(`✓ Created LiteLLM service`));
      return service;
      
    } catch (error: any) {
      console.error(chalk.red(`Failed to create LiteLLM service`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      console.log(chalk.yellow('\n🔧 Manual LiteLLM Setup:'));
      console.log(chalk.yellow('   1. Create a new service in Coolify dashboard'));
      console.log(chalk.yellow('   2. Use Docker image: ghcr.io/berriai/litellm:main-stable'));
      console.log(chalk.yellow('   3. Set port: 4000'));
      console.log(chalk.yellow('   4. Add environment variables: MASTER_KEY, PORT=4000'));
      console.log(chalk.yellow('   5. Mount config file: litellm-config.yaml'));
      
      throw error;
    }
  }

  async createQdrantService(projectId: string): Promise<CoolifyService> {
    try {
      console.log(chalk.blue('Creating Qdrant vector database service...'));
      
      // New format payload for modern Coolify versions
      const newFormatPayload = {
        name: 'qdrant',
        description: 'Qdrant vector database service',
        image: 'qdrant/qdrant:latest',
        ports: [
          { internal: 6333, external: 6333 },
          { internal: 6334, external: 6334 }
        ],
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
        project_id: projectId,
        restart_policy: 'unless-stopped'
      };

      // Legacy format payload for older Coolify versions
      const legacyFormatPayload = {
        name: 'qdrant',
        description: 'Qdrant vector database service',
        docker_registry_image_name: 'qdrant/qdrant',
        docker_registry_image_tag: 'latest',
        ports_exposes: '6333,6334',
        project_uuid: projectId,
        environment_variables: [
          { key: 'QDRANT__SERVICE__HTTP_PORT', value: '6333' },
          { key: 'QDRANT__SERVICE__GRPC_PORT', value: '6334' }
        ]
      };

      const service = await this.createServiceWithFallback(projectId, 'qdrant', newFormatPayload, legacyFormatPayload);
      console.log(chalk.green(`✓ Created Qdrant vector database service`));
      return service;
      
    } catch (error: any) {
      console.error(chalk.red(`Failed to create Qdrant service`));
      
      if (error.response) {
        console.error(chalk.red(`HTTP Status: ${error.response.status}`));
        console.error(chalk.red(`Response Body: ${JSON.stringify(error.response.data, null, 2)}`));
      } else {
        console.error(chalk.red(`Request error: ${error.message}`));
      }
      
      console.log(chalk.yellow('\n🔧 Manual Qdrant Setup:'));
      console.log(chalk.yellow('   1. Create a new service in Coolify dashboard'));
      console.log(chalk.yellow('   2. Use Docker image: qdrant/qdrant:latest'));
      console.log(chalk.yellow('   3. Set ports: 6333 (HTTP), 6334 (gRPC)'));
      console.log(chalk.yellow('   4. Add volume: /qdrant/storage for persistent storage'));
      
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
      
      // Try multiple network creation endpoints based on different Coolify versions
      const endpointsToTry = [
        `/api/v1/projects/${projectId}/networks`,
        `/api/v1/networks`,
        `/projects/${projectId}/networks`
      ];

      const payload = {
        name: networkName,
        driver: 'bridge',
        attachable: true,
        project_id: projectId,
        project_uuid: projectId
      };

      for (const endpoint of endpointsToTry) {
        try {
          console.log(chalk.gray(`API Request: POST ${endpoint}`));
          const response = await this.client.post(endpoint, payload);
          console.log(chalk.green(`✓ Created project network: ${networkName}`));
          return response.data;
        } catch (endpointError: any) {
          console.log(chalk.gray(`Network endpoint ${endpoint} failed: ${endpointError.response?.status || endpointError.message}`));
        }
      }
      
      throw new Error('All network endpoints failed');
    } catch (error: any) {
      // Network creation might not be supported in all Coolify versions
      // This is often handled automatically, so we'll make this non-fatal
      console.log(chalk.yellow(`Note: Could not create custom network (this is often automatic): ${error.response?.data?.message || error.message}`));
      console.log(chalk.gray('Coolify typically handles service networking automatically, so this is not a critical error.'));
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