import type { ObjectCannedACL, ServerSideEncryption, StorageClass } from '@aws-sdk/client-s3';

export interface Logger {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface UploadProgress {
  loaded?: number;
  total?: number;
  part?: number;
  key?: string;
}

export interface S3Config {
  endpoint?: string;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  maxRetries?: number;
  forcePathStyle?: boolean;
  sslEnabled?: boolean;
  dryRun?: boolean;
  onProgress?: (progress: UploadProgress) => void;
  logger?: Logger;
}

export interface UploadOptionsBasic {
  create?: boolean;
  replace?: boolean;
  expire?: string;
  expireDate?: Date;
  storageClass?: StorageClass;
  acl?: ObjectCannedACL;
  serverSideEncryption?: ServerSideEncryption;
  kmsKeyId?: string;
  dryRun?: boolean;
  encryptKey?: string;
  onProgress?: (progress: UploadProgress) => void;
  skipBucketCheck?: boolean;
}

export interface UploadOptions extends UploadOptionsBasic {
  compress?: string | boolean;
  baseDir?: string;
  compressionLevel?: number;
  concurrency?: number;
  followSymlinks?: boolean;
  exclude?: string | string[];
}

export interface CleanOlderOptions {
  dryRun?: boolean;
  keepLast?: number;
}

export interface DownloadOptions {
  decryptKey?: string;
}
