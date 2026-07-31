export interface Hyperdrive {
  connectionString: string;
}

export interface Env {
  HYPERDRIVE: Hyperdrive;
  UPLOADS: R2Bucket;
  JWT_SECRET: string;
  NIM_API_URL?: string;
  NIM_API_KEY?: string;
  CORS_ORIGIN?: string;
}
