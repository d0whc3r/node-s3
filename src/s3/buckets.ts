import {
  Bucket,
  CreateBucketCommand,
  CreateBucketCommandOutput,
  DeleteBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { S3WrapperFiles } from './files';

export class S3WrapperBuckets {
  private s3Files?: S3WrapperFiles;

  constructor(private readonly s3Sdk: S3Client) {}

  public setFileWrapper(s3Files: S3WrapperFiles) {
    this.s3Files = s3Files;
  }

  public async getBuckets(): Promise<Bucket[]> {
    try {
      const data = await this.s3Sdk.send(new ListBucketsCommand({}));
      return data.Buckets || [];
    } catch (error) {
      throw error instanceof Error ? error.message : String(error);
    }
  }

  public async createBucket(bucket: string): Promise<CreateBucketCommandOutput> {
    try {
      return await this.s3Sdk.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      throw error instanceof Error ? error.message : String(error);
    }
  }

  public async removeBucket(bucket: string, force = false): Promise<boolean> {
    try {
      await this.s3Sdk.send(new DeleteBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      if (force && this.s3Files) {
        await this.s3Files.deleteAllContent(bucket);
        return this.removeBucket(bucket, false);
      }
      throw error instanceof Error ? error.message : String(error);
    }
  }

  public async bucketExist(bucket: string): Promise<boolean> {
    try {
      await this.s3Sdk.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
