export interface ProjectOptions {
  projectName: string;
  createInCurrentDir?: boolean;
  useCoolify: boolean;
  coolifyUrl?: string;
  coolifyApiToken?: string;
  database: 'pocketbase' | 'mongodb';
  useRedis: boolean;
  services: string[];
  dockerRegistry?: string;
  registryTag?: string;
  useTauri: boolean;
  tauriPlatforms: string[];
}

export interface CoolifyProject {
  id: string;
  name: string;
  description?: string;
}

export interface CoolifyService {
  id: string;
  name: string;
  type: string;
  project_id: string;
}

export interface ServiceTemplate {
  name: string;
  type: 'docker' | 'compose' | 'prebuilt';
  image?: string;
  compose?: string;
  config?: Record<string, any>;
}

export interface DockerImagePayload {
  project_uuid: string;
  server_uuid?: string; // Optional - only included if available
  environment_name?: string;
  environment_uuid?: string; // Optional - only included if available
  docker_registry_image_name: string;
  docker_registry_image_tag: string;
  ports_exposes: string;
  destination_uuid?: string; // Optional - only included if available
  name: string;
  description?: string;
  domains?: string;
  ports_mappings?: string;
  health_check_enabled?: boolean;
  health_check_path?: string;
  health_check_port?: string;
  health_check_host?: string;
  health_check_method?: string;
  health_check_return_code?: number;
  health_check_scheme?: string;
  health_check_response_text?: string;
  health_check_interval?: number;
  health_check_timeout?: number;
  health_check_retries?: number;
  health_check_start_period?: number;
  limits_memory?: string;
  limits_memory_swap?: string;
  limits_memory_swappiness?: number;
  limits_memory_reservation?: string;
  limits_cpus?: string;
  limits_cpuset?: string;
  limits_cpu_shares?: number;
  custom_labels?: string;
  custom_docker_run_options?: string;
  post_deployment_command?: string;
  post_deployment_command_container?: string;
  pre_deployment_command?: string;
  pre_deployment_command_container?: string;
  manual_webhook_secret_github?: string;
  manual_webhook_secret_gitlab?: string;
  manual_webhook_secret_bitbucket?: string;
  manual_webhook_secret_gitea?: string;
  redirect?: string;
  instant_deploy?: boolean;
  use_build_server?: boolean;
  is_http_basic_auth_enabled?: boolean;
  http_basic_auth_username?: string;
  http_basic_auth_password?: string;
  connect_to_docker_network?: boolean;
}