import { Readable } from 'node:stream';
import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { Config } from './config';
import { S3WrapperBuckets } from './s3/buckets';
import { S3WrapperFiles } from './s3/files';
import { CleanOlderOptions, DownloadOptions, Logger, S3Config, UploadOptions, UploadOptionsBasic } from './types';

export class S3Wrapper {
  public bucket = '';
  public endpoint = '';
  private s3Sdk?: S3Client;
  private ownsClient = false;
  private s3Buckets!: S3WrapperBuckets;
  private s3Files!: S3WrapperFiles;

  constructor(config: S3Config = {}, s3Client?: S3Client) {
    this.setConfig(config, s3Client);
  }

  public setConfig(config: S3Config = {}, s3Client?: S3Client): void {
    if (this.s3Sdk && this.ownsClient) {
      this.s3Sdk.destroy();
    }

    const endpoint = config.endpoint || Config.ENDPOINT || undefined;
    const logger = config.logger ?? console;
    const options = this.buildClientOptions(config, endpoint, logger);

    this.bucket = config.bucket ?? Config.BUCKET;
    this.endpoint = endpoint || '';

    if (s3Client) {
      this.s3Sdk = s3Client;
      this.ownsClient = false;
    } else {
      this.s3Sdk = new S3Client(options);
      this.ownsClient = true;
    }

    this.s3Files = new S3WrapperFiles(this.s3Sdk, {
      ensureBucket: (bucket) => this.ensureBucket(bucket),
      logger,
      dryRun: config.dryRun,
      onProgress: config.onProgress
    });
    this.s3Buckets = new S3WrapperBuckets(this.s3Sdk, (bucket) => this.s3Files.deleteAllContent(bucket));
  }

  private buildClientOptions(config: S3Config, endpoint: string | undefined, logger: Logger): S3ClientConfig {
    const accessKeyId = config.accessKeyId || Config.ACCESS_KEY || undefined;
    const secretAccessKey = config.secretAccessKey || Config.SECRET_KEY || undefined;
    const sessionToken = config.sessionToken || Config.SESSION_TOKEN || undefined;
    const region = config.region || Config.REGION || 'us-east-1';

    const isHttpEndpoint = Boolean(endpoint && /^http:\/\//i.test(endpoint));
    const defaultSsl = isHttpEndpoint ? false : Config.SSL_ENABLED;
    const sslEnabled = config.sslEnabled ?? defaultSsl;
    if (isHttpEndpoint && config.sslEnabled === undefined) {
      logger.warn?.(`${Config.TAG} Using insecure HTTP endpoint "${endpoint}"`);
    }

    const credentials =
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken ? { sessionToken } : {})
          }
        : undefined;

    return {
      region,
      tls: sslEnabled,
      maxAttempts: (config.maxRetries ?? Config.MAX_RETRIES) + 1,
      forcePathStyle: config.forcePathStyle ?? Config.FORCE_PATH_STYLE,
      ...(endpoint ? { endpoint } : {}),
      ...(credentials ? { credentials } : {})
    };
  }

  public destroy(): void {
    if (this.s3Sdk && this.ownsClient) {
      this.s3Sdk.destroy();
      this.s3Sdk = undefined;
      this.ownsClient = false;
    }
  }

  // BUCKETS START
  public getBuckets() {
    return this.s3Buckets.getBuckets();
  }

  public createBucket(bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Buckets.createBucket(bucket);
  }

  public removeBucket(force = false, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Buckets.removeBucket(bucket, force);
  }

  public bucketExist(bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Buckets.bucketExist(bucket);
  }

  public getFiles(bucket = this.bucket, prefix?: string) {
    this.checkBucket(bucket);
    return this.s3Files.getFiles(bucket, prefix);
  }
  // BUCKETS END

  // FILES START
  public fileInfo(name: string, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.fileInfo(bucket, name);
  }

  public fileExist(name: string, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.fileExist(bucket, name);
  }

  public uploadFile(file: string, folderName?: string, options?: UploadOptionsBasic, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.uploadFile(bucket, file, folderName, options);
  }

  public uploadFiles(files: string | string[], folderName?: string, options?: UploadOptions, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.uploadFiles(bucket, files, folderName, options);
  }

  public uploadStream(stream: Readable, filename: string, folderName?: string, options?: UploadOptionsBasic, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.uploadStream(bucket, stream, filename, folderName, options);
  }

  public downloadFile(key: string, destPath: string, options?: DownloadOptions, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.downloadFile(bucket, key, destPath, options);
  }

  public deleteAllContent(bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.deleteAllContent(bucket);
  }

  public cleanOlder(timeSpace: string, folderName?: string, bucket = this.bucket, options?: CleanOlderOptions) {
    this.checkBucket(bucket);
    return this.s3Files.cleanOlder(bucket, timeSpace, folderName, options);
  }

  public createDumpFile() {
    return this.s3Files.createDumpFile();
  }
  // FILES END

  private async ensureBucket(bucket: string): Promise<void> {
    const exist = await this.s3Buckets.bucketExist(bucket);
    if (!exist) {
      await this.s3Buckets.createBucket(bucket);
    }
  }

  private checkBucket(bucket?: string): void {
    if (!bucket) {
      throw new Error(`${Config.TAG} Bucket not defined`);
    }
  }
}

export { createDecryptStream, createEncryptStream } from './crypto';
export { normalizeS3Key } from './s3/files';
export * from './types';
