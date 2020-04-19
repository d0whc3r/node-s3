import S3, { Bucket, CreateBucketOutput } from 'aws-sdk/clients/s3';
import { S3WrapperFiles } from './files';

export class S3WrapperBuckets {
  private s3Files?: S3WrapperFiles;

  constructor(private s3Sdk: S3) {
  }

  public setFileWrapper(s3Files: S3WrapperFiles) {
    this.s3Files = s3Files;
  }

  public getBuckets() {
    return new Promise<Bucket[]>((resolve, reject) => {
      this.s3Sdk.listBuckets((error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data.Buckets || []);
        }
      });
    });
  }

  public createBucket(bucket: string) {
    return new Promise<CreateBucketOutput>((resolve, reject) => {
      this.s3Sdk.createBucket({ Bucket: bucket }, (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  public removeBucket(bucket: string, force = false) {
    return new Promise<boolean>((resolve, reject) => {
      this.s3Sdk.deleteBucket({ Bucket: bucket }, async (error) => {
        if (error) {
          if (force && this.s3Files) {
            await this.s3Files.deleteAllContent(bucket);
            this.removeBucket(bucket, force).then(resolve).catch(reject);
          } else {
            // console.error('Error removing bucket', error);
            reject(error);
          }
        } else {
          resolve(true);
        }
      });
    });
  }

  public bucketExist(bucket: string) {
    return new Promise<boolean>((resolve) => {
      this.s3Sdk.headBucket({ Bucket: bucket }, (error) => {
        if (error) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
}
