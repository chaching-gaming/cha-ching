export type Environment = 'development' | 'staging' | 'production';

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  environment: Environment;
}
