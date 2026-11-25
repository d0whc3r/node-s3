import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { S3Wrapper } from '../src';
import { Config } from '../src/config';
import { clearBucket, getRandomBucketName, initBucket, wait } from './helper';

const SAMPLE_FOLDER = './tests/sample';
const SAMPLE_FILE1 = path.join(SAMPLE_FOLDER, 'sample1.txt');
const SAMPLE_FILE2 = path.join(SAMPLE_FOLDER, 'sample2.jpg');
const SAMPLE_FILE3 = path.join(SAMPLE_FOLDER, 'subfolder', 'sample3.txt');

const hasS3Endpoint = Boolean(process.env.ENDPOINT);

describe.skipIf(!hasS3Endpoint)('s3 integration tests', () => {
  let bucketName: string;
  let s3Wrapper: S3Wrapper;

  beforeAll(async () => {
    bucketName = await initBucket();
    s3Wrapper = new S3Wrapper({ bucket: bucketName });
  });

  afterAll(async () => {
    await clearBucket(bucketName);
  });

  beforeEach(() => {
    s3Wrapper.setConfig({ bucket: bucketName, endpoint: Config.ENDPOINT });
  });

  afterEach(async () => {
    try {
      await s3Wrapper.deleteAllContent();
    } catch {
      console.log('Unable to clean on after each');
    }
  });

  describe('bucket tests', () => {
    it('get buckets', async () => {
      const list = await s3Wrapper.getBuckets();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list.find((l) => l.Name === bucketName)).toBeDefined();
    });

    it('create existing bucket', async () => {
      await expect(s3Wrapper.createBucket(s3Wrapper.bucket)).rejects.toBeDefined();
    });

    it('remove bucket with content', async () => {
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      await expect(s3Wrapper.removeBucket(false, s3Wrapper.bucket)).rejects.toBeDefined();
    });
  });

  describe('file tests', () => {
    it('get files (empty)', async () => {
      const list = await s3Wrapper.getFiles();
      expect(list).toEqual([]);
    });

    it('upload file', async () => {
      const response = await s3Wrapper.uploadFile(SAMPLE_FILE1);
      expect(response).toBeDefined();
    });

    it('upload file to folder', async () => {
      const folder = 'test-folder';
      const destination = path.join(folder, path.basename(SAMPLE_FILE1));
      const response = await s3Wrapper.uploadFile(SAMPLE_FILE1, folder);
      expect(response.Key).toBe(destination);
    });

    it('upload twice a file (without replace)', async () => {
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      await expect(s3Wrapper.uploadFile(SAMPLE_FILE1)).rejects.toBeDefined();
    });

    it('upload twice a file (with replace)', async () => {
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      const response = await s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { replace: true });
      expect(response).toBeDefined();
    });

    it('upload a file with expireDate', async () => {
      const today = new Date();
      const expireDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      const response = await s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { expireDate });
      expect(response).toBeDefined();
    });

    it('upload a file with expire', async () => {
      const response = await s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { expire: '1d' });
      expect(response).toBeDefined();
    });

    describe('create new bucket', () => {
      const alternativeBucket = `not-exiting-bucket-${getRandomBucketName()}`;

      beforeEach(() => {
        s3Wrapper.setConfig({ endpoint: Config.ENDPOINT, bucket: alternativeBucket });
      });

      afterEach(async () => {
        await clearBucket(alternativeBucket);
      });

      it('upload to a not created bucket (without create)', async () => {
        await expect(s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { create: false })).rejects.toBeDefined();
      });

      it('upload to a not created bucket (with create)', async () => {
        const response = await s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { create: true });
        expect(response).toBeDefined();
      });
    });
  });

  describe('upload multiple files', () => {
    it('upload 2 files without compress', async () => {
      const response = await s3Wrapper.uploadFiles([SAMPLE_FILE1, SAMPLE_FILE2], undefined, { compress: false });
      expect(Object.keys(response).sort()).toEqual([SAMPLE_FILE1, SAMPLE_FILE2].sort());
      expect(response[SAMPLE_FILE1].Key).toBe(path.basename(SAMPLE_FILE1));
      expect(response[SAMPLE_FILE2].Key).toBe(path.basename(SAMPLE_FILE2));
    });

    it('upload 2 files with compress', async () => {
      const response = await s3Wrapper.uploadFiles([SAMPLE_FILE1, SAMPLE_FILE2], undefined, { compress: true });
      expect(Object.keys(response)).toHaveLength(1);
    });

    it('upload a directory without compress', async () => {
      const dir = path.dirname(SAMPLE_FILE1);
      const response = await s3Wrapper.uploadFiles(dir, undefined, { compress: false });
      expect(Object.keys(response).sort()).toEqual([SAMPLE_FILE1, SAMPLE_FILE2, SAMPLE_FILE3].sort());
      expect(response[SAMPLE_FILE1].Key).toBe(path.basename(SAMPLE_FILE1));
      expect(response[SAMPLE_FILE2].Key).toBe(path.basename(SAMPLE_FILE2));
      expect(response[SAMPLE_FILE3].Key).toBe(SAMPLE_FILE3.replace(`${dir}/`, ''));
    });

    it('upload a directory with compress', async () => {
      const dir = path.dirname(SAMPLE_FILE1);
      const response = await s3Wrapper.uploadFiles(dir, undefined, { compress: true });
      expect(Object.keys(response)).toHaveLength(1);
    });

    it('upload a directory wildcard without compress', async () => {
      const dir = path.dirname(SAMPLE_FILE1);
      const response = await s3Wrapper.uploadFiles(path.join(dir, '*'), undefined, { compress: false });
      expect(Object.keys(response).sort()).toEqual([SAMPLE_FILE1, SAMPLE_FILE2, SAMPLE_FILE3].sort());
    });

    it('upload a directory wildcard with compress', async () => {
      const dir = path.dirname(SAMPLE_FILE1);
      const response = await s3Wrapper.uploadFiles(path.join(dir, '*'), undefined, { compress: true });
      expect(Object.keys(response)).toHaveLength(1);
    });
  });

  describe('Delete older files', () => {
    it('delete all files older than 5secs', async () => {
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      await s3Wrapper.uploadFile(SAMPLE_FILE2, 'sample-folder');
      await wait(8);
      await s3Wrapper.uploadFile(SAMPLE_FILE2);
      const deleted = await s3Wrapper.cleanOlder('5s');
      expect(deleted.Deleted).toHaveLength(2);
      const list = await s3Wrapper.getFiles();
      expect(list).toHaveLength(1);
      expect(list[0].Key).toBe(path.basename(SAMPLE_FILE2));
    });

    it('delete files older than 5secs in folder', async () => {
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      const folderName = 'sample-folder';
      await s3Wrapper.uploadFile(SAMPLE_FILE2, folderName);
      await wait(8);
      await s3Wrapper.uploadFile(SAMPLE_FILE2);
      const deleted = await s3Wrapper.cleanOlder('5s', folderName);
      expect(deleted.Deleted).toHaveLength(1);
      const list = await s3Wrapper.getFiles();
      expect(list).toHaveLength(2);
    });
  });
});
