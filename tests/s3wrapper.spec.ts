import { clearBucket, getRandomBucketName, initBucket, wait } from './helper';
import { S3Wrapper } from '../src';
import { Config } from '../src/config';
import path from 'path';

// jest.mock('mysqldump', () => {
//   const response = {
//     dump: {
//       schema: 'mock-schema',
//       data: 'mock-data',
//       trigger: 'mock-trigger'
//     },
//     tables: []
//   };
//   return () => jest.fn().mockResolvedValue(response);
// });

const SAMPLE_FOLDER = './tests/sample';
const SAMPLE_FILE1 = path.join(SAMPLE_FOLDER, 'sample1.txt');
const SAMPLE_FILE2 = path.join(SAMPLE_FOLDER, 'sample2.jpg');

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
  afterEach(async () => {
    if (s3Wrapper) {
      try {
        await s3Wrapper.deleteAllContent();
      } catch (_e) {
        console.log('Unable to clean on after each');
      }
    }
  });

  it('s3Wrapper object', () => {
    expect(new S3Wrapper()).toBeDefined();
  });

  describe('bucket tests', () => {
    it('get buckets', async () => {
      const list = await s3Wrapper.getBuckets();
      expect(list).toBeDefined().not.toBeEmpty().toBeArray();
      expect(list.find((l) => l.Name === bucketName)).toBeDefined();
    });
    it('create existing bucket', (done) => {
      expect.assertions(1);
      s3Wrapper.createBucket(s3Wrapper.bucket).catch((err) => {
        expect(err).toBeDefined();
        done();
      });
    });
    it('remove bucket with content', async (done) => {
      expect.assertions(1);
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      s3Wrapper.removeBucket(false, s3Wrapper.bucket).catch((err) => {
        expect(err).toBeDefined();
        done();
      });
    });
  });

  describe('file tests', () => {
    it('get files (empty)', async () => {
      const list = await s3Wrapper.getFiles();
      expect(list).toBeDefined().toBeEmpty();
    });
    it('upload file', (done) => {
      expect.assertions(1);
      s3Wrapper.uploadFile(SAMPLE_FILE1).then((response) => {
        expect(response).toBeDefined();
        done();
      });
    });
    it('upload file to folder', (done) => {
      expect.assertions(2);
      const file = SAMPLE_FILE1;
      const folder = 'test-folder';
      const destination = path.join(folder, path.basename(file));
      s3Wrapper.uploadFile(SAMPLE_FILE1, folder).then((response) => {
        expect(response).toBeDefined().toContainEntry(['Key', destination]);
        done();
      });
    });
    it('upload twice a file (without replace)', async (done) => {
      expect.assertions(1);
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      s3Wrapper.uploadFile(SAMPLE_FILE1).catch((err) => {
        expect(err).toBeDefined();
        done();
      });
    });
    it('upload twice a file (with replace)', async (done) => {
      expect.assertions(1);
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { replace: true }).then((response) => {
        expect(response).toBeDefined();
        done();
      });
    });
    it('upload a file with expireDate', (done) => {
      expect.assertions(1);
      const today = new Date();
      const expireDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { expireDate }).then((response) => {
        expect(response).toBeDefined();
        done();
      });
    });
    it('upload a file with expire', (done) => {
      expect.assertions(1);
      s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { expire: '1d' }).then((response) => {
        expect(response).toBeDefined();
        done();
      });
    });

    describe('create new bucket', () => {
      const alternativeBucket = `not-exiting-bucket-${getRandomBucketName()}`;
      beforeEach(() => {
        s3Wrapper.setConfig({ endpoint: Config.ENDPOINT, bucket: alternativeBucket });
      });
      afterEach(() => {
        clearBucket(alternativeBucket);
      });
      it('upload to a not created bucket (without create)', (done) => {
        expect.assertions(1);
        s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { create: false }).catch((error) => {
          expect(error).toBeDefined();
          done();
        });
      });
      it('upload to a not created bucket (with create)', (done) => {
        expect.assertions(1);
        s3Wrapper.uploadFile(SAMPLE_FILE1, undefined, { create: true }).then((response) => {
          expect(response).toBeDefined();
          done();
        });
      });
    });
  });

  describe('upload multiple files', () => {
    it('upload 2 files without compress', (done) => {
      expect.assertions(9);
      s3Wrapper.uploadFiles([SAMPLE_FILE1, SAMPLE_FILE2], undefined, { compress: false }).then((response) => {
        const file1 = path.basename(SAMPLE_FILE1);
        const file2 = path.basename(SAMPLE_FILE2);
        expect(response).toBeDefined().toBeObject().toContainAllKeys([SAMPLE_FILE1, SAMPLE_FILE2]);
        expect(response[SAMPLE_FILE1]).toBeDefined().toBeObject().toContainEntry(['Key', file1]);
        expect(response[SAMPLE_FILE2]).toBeDefined().toBeObject().toContainEntry(['Key', file2]);
        done();
      });
    });
    it('upload 2 files with compress', (done) => {
      expect.assertions(3);
      s3Wrapper.uploadFiles([SAMPLE_FILE1, SAMPLE_FILE2], undefined, { compress: true }).then((response) => {
        expect(response).toBeDefined().toBeObject();
        expect(Object.keys(response)).toHaveLength(1);
        done();
      });
    });
    it('upload a directory without compress', (done) => {
      expect.assertions(9);
      const dir = path.dirname(SAMPLE_FILE1);
      s3Wrapper.uploadFiles(dir, undefined, { compress: false }).then((response) => {
        const file1 = path.basename(SAMPLE_FILE1);
        const file2 = path.basename(SAMPLE_FILE2);
        expect(response).toBeDefined().toBeObject().toContainAllKeys([SAMPLE_FILE1, SAMPLE_FILE2]);
        expect(response[SAMPLE_FILE1]).toBeDefined().toBeObject().toContainEntry(['Key', file1]);
        expect(response[SAMPLE_FILE2]).toBeDefined().toBeObject().toContainEntry(['Key', file2]);
        done();
      });
    });
    it('upload a directory with compress', (done) => {
      expect.assertions(3);
      const dir = path.dirname(SAMPLE_FILE1);
      s3Wrapper.uploadFiles(dir, undefined, { compress: true }).then((response) => {
        expect(response).toBeDefined().toBeObject();
        expect(Object.keys(response)).toHaveLength(1);
        done();
      });
    });
    it('upload a directory wildcard without compress', (done) => {
      expect.assertions(9);
      const dir = path.dirname(SAMPLE_FILE1);
      s3Wrapper.uploadFiles(path.join(dir, '*'), undefined, { compress: false }).then((response) => {
        const file1 = path.basename(SAMPLE_FILE1);
        const file2 = path.basename(SAMPLE_FILE2);
        expect(response).toBeDefined().toBeObject().toContainAllKeys([SAMPLE_FILE1, SAMPLE_FILE2]);
        expect(response[SAMPLE_FILE1]).toBeDefined().toBeObject().toContainEntry(['Key', file1]);
        expect(response[SAMPLE_FILE2]).toBeDefined().toBeObject().toContainEntry(['Key', file2]);
        done();
      });
    });
    it('upload a directory wildcard with compress', (done) => {
      expect.assertions(3);
      const dir = path.dirname(SAMPLE_FILE1);
      s3Wrapper.uploadFiles(path.join(dir, '*'), undefined, { compress: true }).then((response) => {
        expect(response).toBeDefined().toBeObject();
        expect(Object.keys(response)).toHaveLength(1);
        done();
      });
    });
  });
  describe('Delete older files', () => {
    it('delete all files older than 5secs', async () => {
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      await s3Wrapper.uploadFile(SAMPLE_FILE2, 'sample-folder');
      await wait(8);
      await s3Wrapper.uploadFile(SAMPLE_FILE2);
      const deleted = await s3Wrapper.cleanOlder('5s');
      expect(deleted).toBeDefined().toBeObject().toContainAllKeys(['Deleted', 'Errors']);
      expect(deleted.Errors).toBeEmpty();
      expect(deleted.Deleted).toBeDefined().toBeArray().toHaveLength(2);
      const list = await s3Wrapper.getFiles();
      expect(list).toBeDefined().toBeArray().toHaveLength(1);
      expect(list[0])
        .toBeDefined()
        .toBeObject()
        .toContainEntry(['Key', path.basename(SAMPLE_FILE2)]);
    });
    it('delete files older than 5secs in folder', async () => {
      await s3Wrapper.uploadFile(SAMPLE_FILE1);
      const folderName = 'sample-folder';
      await s3Wrapper.uploadFile(SAMPLE_FILE2, folderName);
      await wait(8);
      await s3Wrapper.uploadFile(SAMPLE_FILE2);
      const deleted = await s3Wrapper.cleanOlder('5s', folderName);
      expect(deleted).toBeDefined().toBeObject().toContainAllKeys(['Deleted', 'Errors']);
      expect(deleted.Errors).toBeEmpty();
      expect(deleted.Deleted).toBeDefined().toBeArray().toHaveLength(1);
      const list = await s3Wrapper.getFiles();
      expect(list).toBeDefined().toBeArray().toHaveLength(2);
    });
  });
  it('Dump mysql as sql file', async () => {
    Config.MYSQL_HOST = 'localhost';
    Config.MYSQL_PORT = 3306;
    Config.MYSQL_USER = 'mock';
    Config.MYSQL_PASSWORD = 'mock';
    Config.MYSQL_DATABASE = 'mock';
    const fileDest = await s3Wrapper.createDumpFile();
    expect(fileDest).toBeDefined().toContain('mysqldump-').toContain('.sql');
  });
});
