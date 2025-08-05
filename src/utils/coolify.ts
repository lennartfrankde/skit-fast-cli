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
        environment_variables: [
          { key: 'NODE_ENV', value: 'production' },
          { key: 'PORT', value: '3000' }
        ]
      });
      
      console.log(chalk.green(`✓ Created SvelteKit service: ${serviceName}`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create SvelteKit service: ${error.response?.data?.message || error.message}`));
      throw error;
    }
  }

  async createPocketBaseService(projectId: string): Promise<CoolifyService> {
    try {
      const response = await this.client.post(`/api/v1/projects/${projectId}/services`, {
        type: 'pocketbase',
        name: 'pocketbase'
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
      const response = await this.client.post(`/api/v1/projects/${projectId}/services`, {
        type: 'redis',
        name: 'redis',
        docker_image: 'redis:alpine'
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
      const response = await this.client.post(`/api/v1/projects/${projectId}/services`, {
        type: 'litellm',
        name: 'litellm'
      });
      
      console.log(chalk.green(`✓ Created LiteLLM service`));
      return response.data;
    } catch (error: any) {
      console.error(chalk.red(`Failed to create LiteLLM service: ${error.response?.data?.message || error.message}`));
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
}