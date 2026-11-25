import {
  Bucket,
  CreateBucketCommand,
  CreateBucketCommandOutput,
  DeleteBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { Config } from '../config';

interface S3ErrorLike {
  name?: string;
  Code?: string;
  $metadata?: {
    httpStatusCode?: number;
  };
}

export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as S3ErrorLike;
  if (err.$metadata?.httpStatusCode === 404) {
    return true;
  }
  const notFoundNames = ['NotFound', 'NoSuchBucket', 'NoSuchKey', '404'];
  return Boolean((err.name && notFoundNames.includes(err.name)) || (err.Code && notFoundNames.includes(err.Code)));
}

export function wrapS3Error(error: unknown, context: string): Error {
  if (error instanceof Error) {
    return new Error(`${Config.TAG} ${context}: ${error.message}`, { cause: error });
  }
  return new Error(`${Config.TAG} ${context}: ${String(error)}`, { cause: error });
}

export class S3WrapperBuckets {
  constructor(
    private readonly s3Sdk: S3Client,
    private readonly deleteAllContentFn?: (bucket: string) => Promise<unknown>
  ) {}

  public async getBuckets(): Promise<Bucket[]> {
    try {
      const data = await this.s3Sdk.send(new ListBucketsCommand({}));
      return data.Buckets || [];
    } catch (error) {
      throw wrapS3Error(error, 'Failed to list buckets');
    }
  }

  public async createBucket(bucket: string): Promise<CreateBucketCommandOutput> {
    try {
      return await this.s3Sdk.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      throw wrapS3Error(error, `Failed to create bucket "${bucket}"`);
    }
  }

  public async removeBucket(bucket: string, force = false): Promise<boolean> {
    try {
      await this.s3Sdk.send(new DeleteBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      if (force && this.deleteAllContentFn) {
        await this.deleteAllContentFn(bucket);
        return this.removeBucket(bucket, false);
      }
      throw wrapS3Error(error, `Failed to remove bucket "${bucket}"`);
    }
  }

  public async bucketExist(bucket: string): Promise<boolean> {
    try {
      await this.s3Sdk.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw wrapS3Error(error, `Failed to check bucket "${bucket}"`);
    }
  }
}
