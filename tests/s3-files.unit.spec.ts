import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Config } from '../src/config';
import { createDecryptStream, createEncryptStream } from '../src/crypto';
import { normalizeS3Key, S3WrapperFiles } from '../src/s3/files';

vi.mock('mysqldump', () => ({
  default: vi.fn().mockResolvedValue({
    dump: {
      schema: '# schema comment\nCREATE TABLE t (id INT);',
      data: '# data comment\nINSERT INTO t VALUES (1);',
      trigger: ''
    },
    tables: []
  })
}));

const s3Mock = mockClient(S3Client);
const SAMPLE_DIR = path.resolve('./tests/sample');
const SAMPLE_FILE1 = path.join(SAMPLE_DIR, 'sample1.txt');
const SAMPLE_FILE2 = path.join(SAMPLE_DIR, 'sample2.jpg');

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

describe('S3WrapperFiles (unit)', () => {
  let client: S3Client;
  let files: S3WrapperFiles;
  let ensureBucket: ReturnType<typeof vi.fn<(bucket: string) => Promise<void>>>;

  beforeEach(() => {
    s3Mock.reset();
    vi.clearAllMocks();
    Config.resetOverrides();
    client = new S3Client({ region: 'us-east-1' });
    ensureBucket = vi.fn<(bucket: string) => Promise<void>>().mockResolvedValue(undefined);
    files = new S3WrapperFiles(client, { ensureBucket, logger: silentLogger });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('normalizeS3Key', () => {
    it('strips leading slashes and collapses double slashes', () => {
      expect(normalizeS3Key('/folder/', '//sub//', 'file.txt')).toBe('folder/sub/file.txt');
      expect(normalizeS3Key('win\\path\\file.txt')).toBe('win/path/file.txt');
    });

    it('rejects parent traversal segments', () => {
      expect(() => normalizeS3Key('folder', '../secret.txt')).toThrow(/Invalid S3 key segment/);
    });
  });

  describe('getFiles', () => {
    it('paginates through >1000 objects via NextContinuationToken', async () => {
      const page1 = Array.from({ length: 1000 }, (_, i) => ({ Key: `item-${i}.txt` }));
      const page2 = Array.from({ length: 250 }, (_, i) => ({ Key: `item-${1000 + i}.txt` }));

      s3Mock
        .on(ListObjectsV2Command, { Bucket: 'test-bucket', ContinuationToken: undefined })
        .resolvesOnce({ Contents: page1, IsTruncated: true, NextContinuationToken: 'tok-2' })
        .on(ListObjectsV2Command, { Bucket: 'test-bucket', ContinuationToken: 'tok-2' })
        .resolvesOnce({ Contents: page2, IsTruncated: false });

      const result = await files.getFiles('test-bucket');
      expect(result).toHaveLength(1250);
      expect(s3Mock.commandCalls(ListObjectsV2Command)).toHaveLength(2);
    });

    it('passes normalized Prefix directly to ListObjectsV2Command', async () => {
      s3Mock.on(ListObjectsV2Command, { Bucket: 'test-bucket', Prefix: 'backups/daily/' }).resolves({
        Contents: [{ Key: 'backups/daily/a.sql' }]
      });

      const result = await files.getFiles('test-bucket', '/backups/daily/');
      expect(result).toHaveLength(1);
      expect(result[0].Key).toBe('backups/daily/a.sql');
    });
  });

  describe('fileInfo and fileExist', () => {
    it('fileInfo sends HeadObjectCommand and returns metadata', async () => {
      s3Mock.on(HeadObjectCommand, { Bucket: 'b', Key: 'dir/a.txt' }).resolves({ ContentLength: 42 });
      const info = await files.fileInfo('b', '/dir//a.txt');
      expect(info.ContentLength).toBe(42);
    });

    it('fileExist returns true on 200, false on 404, and throws on 403', async () => {
      s3Mock.on(HeadObjectCommand, { Bucket: 'b', Key: 'ok.txt' }).resolves({});
      expect(await files.fileExist('b', 'ok.txt')).toBe(true);

      const notFound = Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
      s3Mock.on(HeadObjectCommand, { Bucket: 'b', Key: 'missing.txt' }).rejects(notFound);
      expect(await files.fileExist('b', 'missing.txt')).toBe(false);

      const forbidden = Object.assign(new Error('Forbidden'), { name: 'Forbidden', $metadata: { httpStatusCode: 403 } });
      s3Mock.on(HeadObjectCommand, { Bucket: 'b', Key: 'secret.txt' }).rejects(forbidden);
      await expect(files.fileExist('b', 'secret.txt')).rejects.toThrowError(/Forbidden/);
    });
  });

  describe('deleteFiles and deleteAllContent', () => {
    it('short-circuits on empty list without calling S3', async () => {
      const res = await files.deleteFiles('b', []);
      expect(res.Deleted).toEqual([]);
      expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
    });

    it('chunks >1000 keys into batches of 1000', async () => {
      const keys = Array.from({ length: 2200 }, (_, i) => ({ Key: `file-${i}.txt` }));
      s3Mock.on(DeleteObjectsCommand).callsFake((input) => ({
        Deleted: (input.Delete?.Objects ?? []).map((o: { Key?: string }) => ({ Key: o.Key }))
      }));

      const res = await files.deleteFiles('b', keys);
      expect(res.Deleted).toHaveLength(2200);
      const calls = s3Mock.commandCalls(DeleteObjectsCommand);
      expect(calls).toHaveLength(3);
      expect(calls[0].args[0].input.Delete?.Objects).toHaveLength(1000);
      expect(calls[1].args[0].input.Delete?.Objects).toHaveLength(1000);
      expect(calls[2].args[0].input.Delete?.Objects).toHaveLength(200);
    });

    it('surfaces DeleteObjectsCommand Errors by throwing Error', async () => {
      s3Mock.on(DeleteObjectsCommand).resolves({
        Deleted: [],
        Errors: [{ Key: 'locked.txt', Code: 'AccessDenied', Message: 'Denied' }]
      });

      await expect(files.deleteFiles('b', [{ Key: 'locked.txt' }])).rejects.toThrowError(/locked\.txt.*AccessDenied/);
    });

    it('deleteAllContent lists and deletes all keys', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'a.txt' }, { Key: 'b.txt' }] });
      s3Mock.on(DeleteObjectsCommand).resolves({ Deleted: [{ Key: 'a.txt' }, { Key: 'b.txt' }] });

      const res = await files.deleteAllContent('b');
      expect(res.Deleted).toHaveLength(2);
    });
  });

  describe('uploadFile', () => {
    const notFoundErr = () => Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });

    it('uploads to root and folder with S3 options and progress', async () => {
      s3Mock.on(HeadObjectCommand).rejects(notFoundErr());
      s3Mock.on(PutObjectCommand).resolves({ ETag: '"etag1"' });
      const onProgress = vi.fn();

      const res = await files.uploadFile('my-bucket', SAMPLE_FILE1, 'daily', {
        create: true,
        replace: false,
        storageClass: 'STANDARD_IA',
        acl: 'private',
        serverSideEncryption: 'aws:kms',
        kmsKeyId: 'arn:aws:kms:us-east-1:123:key/abc',
        expire: '7d',
        onProgress
      });

      expect(res.Key).toBe('daily/sample1.txt');
      expect(ensureBucket).toHaveBeenCalledWith('my-bucket');
      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      expect(putCalls).toHaveLength(1);
      const putInput = putCalls[0].args[0].input;
      expect(putInput.StorageClass).toBe('STANDARD_IA');
      expect(putInput.ACL).toBe('private');
      expect(putInput.ServerSideEncryption).toBe('aws:kms');
      expect(putInput.SSEKMSKeyId).toBe('arn:aws:kms:us-east-1:123:key/abc');
      expect(putInput.Expires).toBeInstanceOf(Date);
      expect(onProgress).toHaveBeenCalled();
    });

    it('throws when file exists and replace is false', async () => {
      s3Mock.on(HeadObjectCommand).resolves({});
      await expect(files.uploadFile('b', SAMPLE_FILE1, undefined, { replace: false })).rejects.toThrowError(/already exists/);
    });

    it('replaces when replace is true without calling HeadObjectCommand', async () => {
      s3Mock.on(PutObjectCommand).resolves({ ETag: '"e"' });
      const res = await files.uploadFile('b', SAMPLE_FILE1, undefined, { replace: true, create: false });
      expect(res.Key).toBe('sample1.txt');
      expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(0);
      expect(ensureBucket).not.toHaveBeenCalled();
    });

    it('respects expireDate and dryRun', async () => {
      const expireDate = new Date('2030-01-01T00:00:00Z');
      s3Mock.on(PutObjectCommand).resolves({});
      await files.uploadFile('b', SAMPLE_FILE1, undefined, { replace: true, expireDate });
      expect(s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Expires).toEqual(expireDate);

      s3Mock.reset();
      const dryRes = await files.uploadFile('b', SAMPLE_FILE1, 'folder', { dryRun: true });
      expect(dryRes.Key).toBe('folder/sample1.txt');
      expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
    });

    it('encrypts upload stream when encryptKey is provided', async () => {
      let uploadedBuffer = Buffer.alloc(0);
      s3Mock.on(PutObjectCommand).callsFake(async (input) => {
        if (Buffer.isBuffer(input.Body)) {
          uploadedBuffer = input.Body;
        } else if (input.Body instanceof Uint8Array) {
          uploadedBuffer = Buffer.from(input.Body);
        }
        return { ETag: '"enc"' };
      });

      await files.uploadFile('b', SAMPLE_FILE1, undefined, { replace: true, encryptKey: 'super-secret' });
      expect(uploadedBuffer.subarray(0, 4).toString('ascii')).toBe('NS3E');

      const chunks: Buffer[] = [];
      await pipeline(Readable.from([uploadedBuffer]), createDecryptStream('super-secret'), async (source) => {
        for await (const chunk of source) {
          chunks.push(Buffer.from(chunk));
        }
      });
      const original = await fsp.readFile(SAMPLE_FILE1);
      expect(Buffer.concat(chunks).equals(original)).toBe(true);
    });

    it('wraps error when PutObjectCommand fails', async () => {
      s3Mock.on(PutObjectCommand).rejects(new Error('NetworkReset'));
      await expect(files.uploadFile('b', SAMPLE_FILE1, undefined, { replace: true })).rejects.toThrowError(/NetworkReset/);
    });
  });

  describe('uploadFiles', () => {
    beforeEach(() => {
      s3Mock.on(PutObjectCommand).resolves({ ETag: '"e"' });
    });

    it('uploads array, directory, and glob without mutating caller options', async () => {
      const callerOpts = { replace: true, create: true };
      const snapshot = { ...callerOpts };

      const arrRes = await files.uploadFiles('b', [SAMPLE_FILE1, SAMPLE_FILE2], 'arr', callerOpts);
      expect(Object.keys(arrRes)).toHaveLength(2);
      expect(ensureBucket).toHaveBeenCalledTimes(1);
      expect(callerOpts).toEqual(snapshot);

      const dirRes = await files.uploadFiles('b', SAMPLE_DIR, 'dir', callerOpts);
      expect(Object.keys(dirRes)).toHaveLength(3);
      expect(callerOpts).toEqual(snapshot);

      const globRes = await files.uploadFiles('b', path.join(SAMPLE_DIR, '*'), 'glob', callerOpts);
      expect(Object.keys(globRes)).toHaveLength(3);
      expect(callerOpts).toEqual(snapshot);
    });

    it('applies exclude patterns', async () => {
      const res = await files.uploadFiles('b', SAMPLE_DIR, undefined, { replace: true, exclude: '*.jpg' });
      const keys = Object.keys(res);
      expect(keys.some((k) => k.endsWith('.jpg'))).toBe(false);
      expect(keys.some((k) => k.endsWith('sample1.txt'))).toBe(true);
    });

    it('compresses files and cleans up temp archive after success and failure', async () => {
      const res = await files.uploadFiles('b', [SAMPLE_FILE1, SAMPLE_FILE2], 'zips', {
        compress: 'bundle.zip',
        replace: true
      });
      const [zipPath] = Object.keys(res);
      expect(path.basename(zipPath)).toBe('bundle.zip');
      expect(fs.existsSync(zipPath)).toBe(false);
      expect(fs.existsSync(path.dirname(zipPath))).toBe(false);

      // Failure cleanup
      s3Mock.on(PutObjectCommand).rejects(new Error('UploadBoom'));
      await expect(files.uploadFiles('b', [SAMPLE_FILE1], 'zips', { compress: 'fail.zip', replace: true })).rejects.toThrowError(/UploadBoom/);

      // Rejects archive name containing '*'
      await expect(files.uploadFiles('b', [SAMPLE_FILE1], undefined, { compress: 'bad*.zip', replace: true })).rejects.toThrowError(
        /Invalid archive filename/
      );
    });

    it('skips symlinks by default and follows when followSymlinks=true', async () => {
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'node-s3-sym-'));
      try {
        const realFile = path.join(tmpDir, 'real.txt');
        const linkFile = path.join(tmpDir, 'link.txt');
        await fsp.writeFile(realFile, 'hello');
        await fsp.symlink(realFile, linkFile);

        const skipped = await files.uploadFiles('b', [linkFile], undefined, { replace: true });
        expect(Object.keys(skipped)).toHaveLength(0);

        const followed = await files.uploadFiles('b', [linkFile], undefined, { replace: true, followSymlinks: true });
        expect(Object.keys(followed)).toHaveLength(1);
      } finally {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('cleanOlder', () => {
    it('deletes only older files, respects keepLast, dryRun, and Prefix', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));

      const objects = [
        { Key: 'daily/newest.sql', LastModified: new Date('2026-06-14T12:00:00Z') }, // 1d old
        { Key: 'daily/mid.sql', LastModified: new Date('2026-06-05T12:00:00Z') }, // 10d old
        { Key: 'daily/old.sql', LastModified: new Date('2026-06-01T12:00:00Z') } // 14d old
      ];
      s3Mock.on(ListObjectsV2Command, { Bucket: 'b', Prefix: 'daily/' }).resolves({ Contents: objects });
      s3Mock.on(DeleteObjectsCommand).callsFake((input) => ({
        Deleted: (input.Delete?.Objects ?? []).map((o: { Key?: string }) => ({ Key: o.Key }))
      }));

      // dryRun with keepLast=2 -> only oldest (14d) would be deleted, no S3 delete call
      const dry = await files.cleanOlder('b', '7d', 'daily', { keepLast: 2, dryRun: true });
      expect(dry.Deleted).toEqual([{ Key: 'daily/old.sql' }]);
      expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(0);

      // real run with keepLast=1 -> both 10d and 14d deleted, newest kept
      const real = await files.cleanOlder('b', '7d', 'daily', { keepLast: 1 });
      expect(real.Deleted?.map((d) => d.Key)).toEqual(['daily/mid.sql', 'daily/old.sql']);
      expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(1);
    });

    it('rejects invalid time units with descriptive Error', async () => {
      for (const bad of ['', 'abc', '5x', '-5d', '5ms', '5d extra', '10Y']) {
        await expect(files.cleanOlder('b', bad)).rejects.toThrowError(/Invalid time definition/);
      }
    });
  });

  describe('downloadFile', () => {
    it('downloads plain and encrypted files', async () => {
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'node-s3-dl-'));
      try {
        const plainDest = path.join(tmpDir, 'sub', 'plain.txt');
        s3Mock.on(GetObjectCommand, { Bucket: 'b', Key: 'docs/plain.txt' }).resolves({
          Body: Readable.from([Buffer.from('hello world')]) as never
        });
        await files.downloadFile('b', 'docs/plain.txt', plainDest);
        expect(await fsp.readFile(plainDest, 'utf8')).toBe('hello world');

        // Encrypted download
        const secret = 'my-passphrase';
        const payload = crypto.randomBytes(1024);
        const encChunks: Buffer[] = [];
        await pipeline(Readable.from([payload]), createEncryptStream(secret), async (src) => {
          for await (const c of src) encChunks.push(Buffer.from(c));
        });
        s3Mock.on(GetObjectCommand, { Bucket: 'b', Key: 'docs/secret.bin' }).resolves({
          Body: Readable.from([Buffer.concat(encChunks)]) as never
        });
        const decDest = path.join(tmpDir, 'secret.bin');
        await files.downloadFile('b', 'docs/secret.bin', decDest, { decryptKey: secret });
        expect((await fsp.readFile(decDest)).equals(payload)).toBe(true);
      } finally {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('createDumpFile', () => {
    it('throws when mysql env vars are missing', async () => {
      vi.stubEnv('MYSQL_USER', '');
      vi.stubEnv('MYSQL_PASSWORD', '');
      vi.stubEnv('MYSQL_DATABASE', '');
      await expect(files.createDumpFile()).rejects.toThrowError(/mysql-dump environment variables/);
    });

    it('creates a private temp sql dump file', async () => {
      vi.stubEnv('MYSQL_HOST', 'localhost');
      vi.stubEnv('MYSQL_PORT', '3306');
      vi.stubEnv('MYSQL_USER', 'root');
      vi.stubEnv('MYSQL_PASSWORD', 'pass');
      vi.stubEnv('MYSQL_DATABASE', 'appdb');

      const fileDest = await files.createDumpFile();
      try {
        expect(fileDest).toContain('mysqldump-');
        expect(fileDest).toMatch(/\.sql$/);
        const content = await fsp.readFile(fileDest, 'utf8');
        expect(content).toContain('-- schema comment');
        expect(content).toContain('CREATE TABLE t');
      } finally {
        await fsp.rm(path.dirname(fileDest), { recursive: true, force: true });
      }
    });
  });
});
