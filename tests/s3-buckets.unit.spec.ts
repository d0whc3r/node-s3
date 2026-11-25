import { CreateBucketCommand, DeleteBucketCommand, HeadBucketCommand, ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { S3WrapperBuckets } from '../src/s3/buckets';

const s3Mock = mockClient(S3Client);

describe('S3WrapperBuckets (unit)', () => {
  let client: S3Client;

  beforeEach(() => {
    s3Mock.reset();
    client = new S3Client({ region: 'us-east-1' });
  });

  describe('getBuckets', () => {
    it('returns bucket list when present', async () => {
      s3Mock.on(ListBucketsCommand).resolves({
        Buckets: [{ Name: 'bucket-a' }, { Name: 'bucket-b' }]
      });
      const buckets = new S3WrapperBuckets(client);
      const result = await buckets.getBuckets();
      expect(result).toEqual([{ Name: 'bucket-a' }, { Name: 'bucket-b' }]);
    });

    it('returns empty array when Buckets is undefined', async () => {
      s3Mock.on(ListBucketsCommand).resolves({});
      const buckets = new S3WrapperBuckets(client);
      expect(await buckets.getBuckets()).toEqual([]);
    });

    it('throws wrapped Error with cause on failure', async () => {
      const rootCause = new Error('AccessDenied');
      s3Mock.on(ListBucketsCommand).rejects(rootCause);
      const buckets = new S3WrapperBuckets(client);
      await expect(buckets.getBuckets()).rejects.toThrowError(/Failed to list buckets: AccessDenied/);
      try {
        await buckets.getBuckets();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).cause).toBe(rootCause);
      }
    });
  });

  describe('createBucket', () => {
    it('creates a bucket', async () => {
      s3Mock.on(CreateBucketCommand, { Bucket: 'my-bucket' }).resolves({ Location: '/my-bucket' });
      const buckets = new S3WrapperBuckets(client);
      const res = await buckets.createBucket('my-bucket');
      expect(res.Location).toBe('/my-bucket');
    });

    it('throws wrapped Error on failure', async () => {
      s3Mock.on(CreateBucketCommand).rejects(new Error('BucketAlreadyExists'));
      const buckets = new S3WrapperBuckets(client);
      await expect(buckets.createBucket('my-bucket')).rejects.toThrowError(/BucketAlreadyExists/);
    });
  });

  describe('removeBucket', () => {
    it('removes an empty bucket when force=false', async () => {
      s3Mock.on(DeleteBucketCommand, { Bucket: 'my-bucket' }).resolves({});
      const buckets = new S3WrapperBuckets(client);
      expect(await buckets.removeBucket('my-bucket', false)).toBe(true);
    });

    it('throws when force=false and bucket is not empty', async () => {
      s3Mock.on(DeleteBucketCommand).rejects(new Error('BucketNotEmpty'));
      const buckets = new S3WrapperBuckets(client);
      await expect(buckets.removeBucket('my-bucket', false)).rejects.toThrowError(/BucketNotEmpty/);
    });

    it('deletes content then removes bucket when force=true', async () => {
      s3Mock.on(DeleteBucketCommand, { Bucket: 'my-bucket' }).rejectsOnce(new Error('BucketNotEmpty')).resolvesOnce({});
      const deleteAllContent = vi.fn().mockResolvedValue({ Deleted: [] });
      const buckets = new S3WrapperBuckets(client, deleteAllContent);

      expect(await buckets.removeBucket('my-bucket', true)).toBe(true);
      expect(deleteAllContent).toHaveBeenCalledTimes(1);
      expect(deleteAllContent).toHaveBeenCalledWith('my-bucket');
    });
  });

  describe('bucketExist', () => {
    it('returns true on 200', async () => {
      s3Mock.on(HeadBucketCommand, { Bucket: 'existing' }).resolves({});
      const buckets = new S3WrapperBuckets(client);
      expect(await buckets.bucketExist('existing')).toBe(true);
    });

    it('returns false on 404 / NotFound / NoSuchBucket', async () => {
      const notFoundErr = Object.assign(new Error('Not Found'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 }
      });
      s3Mock.on(HeadBucketCommand, { Bucket: 'missing' }).rejects(notFoundErr);
      const buckets = new S3WrapperBuckets(client);
      expect(await buckets.bucketExist('missing')).toBe(false);
    });

    it('rethrows 403 / auth errors instead of returning false', async () => {
      const forbiddenErr = Object.assign(new Error('Forbidden'), {
        name: 'Forbidden',
        $metadata: { httpStatusCode: 403 }
      });
      s3Mock.on(HeadBucketCommand, { Bucket: 'private' }).rejects(forbiddenErr);
      const buckets = new S3WrapperBuckets(client);
      await expect(buckets.bucketExist('private')).rejects.toThrowError(/Forbidden/);
    });
  });
});
