import S3, { ClientConfiguration } from 'aws-sdk/clients/s3';
import { S3WrapperBuckets } from './s3/buckets';
import { S3WrapperFiles } from './s3/files';
import { S3Config, UploadOptions, UploadOptionsBasic } from './types';
import { Config } from './config';

export class S3Wrapper {
  private static s3Instance: S3Wrapper;
  private readonly s3Sdk: S3;
  private readonly s3Buckets: S3WrapperBuckets;
  private readonly s3Files: S3WrapperFiles;
  public readonly bucket: string;
  private readonly options: ClientConfiguration;

  private constructor(config: S3Config = {}) {
    const defOptions = {
      maxRetries: Config.MAX_RETRIES,
      sslEnabled: Config.SSL_ENABLED,
      ...config,
      s3ForcePathStyle: config.forcePathStyle !== undefined ? config.forcePathStyle : Config.FORCE_PATH_STYLE,
      endpoint: config.endpoint || Config.ENDPOINT,
    };
    this.options = {
      ...defOptions,
      apiVersion: Config.API_VERSION,
      accessKeyId: Config.ACCESS_KEY,
      secretAccessKey: Config.SECRET_KEY
    };
    this.bucket = config.bucket || Config.BUCKET;
    this.s3Sdk = new S3(this.options);
    this.s3Buckets = new S3WrapperBuckets(this.s3Sdk);
    this.s3Files = new S3WrapperFiles(this.s3Sdk);
    this.s3Buckets.setFileWrapper(this.s3Files);
    this.s3Files.setBucketWrapper(this.s3Buckets);
  }

  public static getInstance(config?: S3Config) {
    if (!this.s3Instance) {
      this.s3Instance = new S3Wrapper(config);
    }
    return this.s3Instance;
  }

  get endpoint() {
    return this.options.endpoint;
  }

  // BUCKETS START

  public getBuckets() {
    return this.s3Buckets.getBuckets();
  }

  private checkBucket(bucket?: string) {
    if (!bucket) {
      throw new Error(`${Config.TAG} Bucket not defined`);
    }
  }

  public createBucket(bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Buckets.createBucket(this.bucket);
  }

  public removeBucket(force?: boolean, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Buckets.removeBucket(bucket, force);
  }

  // private bucketExist(bucket = this.bucket) {
  //   return this.s3Buckets.bucketExist(bucket);
  // }

  // BUCKETS END

  // FILES START

  public getFiles(bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.getFiles(bucket);
  }

  public uploadFile(file: string, folderName?: string, options?: UploadOptionsBasic, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.uploadFile(bucket, file, folderName, options);
  }

  public uploadFiles(files: string | string[], folderName?: string, options?: UploadOptions, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.uploadFiles(bucket, files, folderName, options);
  }

  // public fileExist(bucket = this.bucket, name: string) {
  //   return this.s3Files.fileExist(bucket,name);
  // }

  // public fileInfo(bucket = this.bucket, name: string) {
  //   return this.s3Files.fileInfo(bucket, name);
  // }

  public deleteAllContent(bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.deleteAllContent(bucket);
  }

  public cleanOlder(timeSpace: string, folderName?: string, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.cleanOlder(bucket, timeSpace, folderName);
  }

  public createDumpFile() {
    return this.s3Files.createDumpFile();
  }

  // FILES END
}
