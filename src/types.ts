export interface ProjectOptions {
  projectName: string;
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