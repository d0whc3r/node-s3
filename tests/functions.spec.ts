import { clearBucket, initBucket } from './helper';
import { S3Wrapper } from '../src';
import { Config } from '../src/config';

describe('s3 tests', () => {
  let bucketName: string;
  let s3Wrapper: S3Wrapper;

  beforeAll(async () => {
    bucketName = await initBucket();
    if (!bucketName) {
      process.exit(-1);
    }
    s3Wrapper = new S3Wrapper({ bucket: bucketName });
  });
  afterAll(async () => {
    await clearBucket(bucketName);
  });

  beforeEach(() => {
    if (s3Wrapper) {
      s3Wrapper.setConfig({ bucket: bucketName, endpoint: Config.ENDPOINT });
    }
  });

  describe('bucket tests', () => {
    it('get buckets', async () => {
      const list = await s3Wrapper.getBuckets();
      expect(list).toBeDefined().not.toBeEmpty().toBeArray();
      expect(list.find((l) => l.Name === bucketName)).toBeDefined();
    });
    it('get buckets from other endpoint (error)', async () => {
      s3Wrapper.setConfig({ endpoint: 'http://localhost' });
      await expect(s3Wrapper.getBuckets()).rejects.toBeDefined();
    });
  });

  // describe('file tests', () => {
  //   it('get files (empty)', async () => {
  //     const list = await s3Wrapper.getFiles();
  //   });
  // });
});
