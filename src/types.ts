export interface S3Config {
  endpoint?: string;
  bucket?: string;
  region?: string;
  maxRetries?: number;
  forcePathStyle?: boolean;
  sslEnabled?: boolean;
}

export interface UploadOptionsBasic {
  create?: boolean;
  replace?: boolean;
  expire?: string;
  expireDate?: Date;
}

export interface UploadOptions extends UploadOptionsBasic {
  compress?: string | boolean;
}
