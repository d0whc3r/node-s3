import S3, { ClientConfiguration } from 'aws-sdk/clients/s3';
import { S3WrapperBuckets } from './s3/buckets';
import { S3WrapperFiles } from './s3/files';
import { S3Config, UploadOptions, UploadOptionsBasic } from './types';
import { Config } from './config';

export class S3Wrapper {
  public bucket = '';
  public endpoint = '';
  private s3Sdk!: S3;
  private s3Buckets!: S3WrapperBuckets;
  private s3Files!: S3WrapperFiles;

  constructor(config: S3Config = {}) {
    this.setConfig(config);
  }

  public setConfig(config: S3Config = {}) {
    const defOptions: ClientConfiguration = {
      maxRetries: Config.MAX_RETRIES,
      sslEnabled: Config.SSL_ENABLED,
      ...config,
      s3ForcePathStyle: config.forcePathStyle !== undefined ? config.forcePathStyle : Config.FORCE_PATH_STYLE,
      endpoint: config.endpoint || Config.ENDPOINT
    };
    const options: ClientConfiguration = {
      ...defOptions,
      apiVersion: Config.API_VERSION,
      accessKeyId: Config.ACCESS_KEY,
      secretAccessKey: Config.SECRET_KEY
    };
    this.bucket = config.bucket || Config.BUCKET;
    this.endpoint = config.endpoint || Config.ENDPOINT;
    this.s3Sdk = new S3(options);
    this.s3Buckets = new S3WrapperBuckets(this.s3Sdk);
    this.s3Files = new S3WrapperFiles(this.s3Sdk);
    this.s3Buckets.setFileWrapper(this.s3Files);
    this.s3Files.setBucketWrapper(this.s3Buckets);
  }

  // BUCKETS START

  public getBuckets() {
    return this.s3Buckets.getBuckets();
  }

  public createBucket(bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Buckets.createBucket(this.bucket);
  }

  public removeBucket(force?: boolean, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Buckets.removeBucket(bucket, force);
  }

  public getFiles(bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.getFiles(bucket);
  }

  // private bucketExist(bucket = this.bucket) {
  //   return this.s3Buckets.bucketExist(bucket);
  // }

  // BUCKETS END

  // FILES START

  public uploadFile(file: string, folderName?: string, options?: UploadOptionsBasic, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.uploadFile(bucket, file, folderName, options);
  }

  public uploadFiles(files: string | string[], folderName?: string, options?: UploadOptions, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.uploadFiles(bucket, files, folderName, options);
  }

  public deleteAllContent(bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.deleteAllContent(bucket);
  }

  // public fileExist(bucket = this.bucket, name: string) {
  //   return this.s3Files.fileExist(bucket,name);
  // }

  // public fileInfo(bucket = this.bucket, name: string) {
  //   return this.s3Files.fileInfo(bucket, name);
  // }

  public cleanOlder(timeSpace: string, folderName?: string, bucket = this.bucket) {
    this.checkBucket(bucket);
    return this.s3Files.cleanOlder(bucket, timeSpace, folderName);
  }

  public createDumpFile() {
    return this.s3Files.createDumpFile();
  }

  private checkBucket(bucket?: string) {
    if (!bucket) {
      throw new Error(`${Config.TAG} Bucket not defined`);
    }
  }

  // FILES END
}
