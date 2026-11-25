import { Readable } from 'node:stream';
import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Wrapper } from '../src';
import { Config } from '../src/config';

const s3Mock = mockClient(S3Client);

describe('S3Wrapper (unit)', () => {
  beforeEach(() => {
    s3Mock.reset();
    Config.resetOverrides();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    Config.resetOverrides();
    vi.unstubAllEnvs();
  });

  it('resolves config precedence: explicit config > AWS_* env > legacy env', () => {
    vi.stubEnv('ENDPOINT', 'https://legacy.example.com');
    vi.stubEnv('ACCESS_KEY', 'legacy-ak');
    vi.stubEnv('SECRET_KEY', 'legacy-sk');
    vi.stubEnv('BUCKET', 'legacy-bucket');

    const wLegacy = new S3Wrapper();
    expect(wLegacy.endpoint).toBe('https://legacy.example.com');
    expect(wLegacy.bucket).toBe('legacy-bucket');
    wLegacy.destroy();

    vi.stubEnv('AWS_ENDPOINT_URL', 'https://aws-env.example.com');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'aws-ak');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'aws-sk');
    vi.stubEnv('AWS_REGION', 'eu-west-1');

    expect(Config.ENDPOINT).toBe('https://aws-env.example.com');
    expect(Config.ACCESS_KEY).toBe('aws-ak');
    expect(Config.SECRET_KEY).toBe('aws-sk');
    expect(Config.REGION).toBe('eu-west-1');

    const wExplicit = new S3Wrapper({
      endpoint: 'https://explicit.example.com',
      bucket: 'explicit-bucket',
      region: 'ap-northeast-1',
      accessKeyId: 'exp-ak',
      secretAccessKey: 'exp-sk',
      sessionToken: 'exp-tok'
    });
    expect(wExplicit.endpoint).toBe('https://explicit.example.com');
    expect(wExplicit.bucket).toBe('explicit-bucket');
    wExplicit.destroy();
  });

  it('parses boolean env vars case-insensitively', () => {
    vi.stubEnv('FORCE_PATH_STYLE', 'YES');
    vi.stubEnv('SSL_ENABLED', '1');
    expect(Config.FORCE_PATH_STYLE).toBe(true);
    expect(Config.SSL_ENABLED).toBe(true);

    vi.stubEnv('FORCE_PATH_STYLE', 'false');
    vi.stubEnv('SSL_ENABLED', '0');
    expect(Config.FORCE_PATH_STYLE).toBe(false);
    expect(Config.SSL_ENABLED).toBe(false);
  });

  it('warns on http:// endpoint when sslEnabled is not explicitly set', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const wrapper = new S3Wrapper({ endpoint: 'http://localhost:9000', logger });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('insecure HTTP endpoint'));
    wrapper.destroy();
  });

  it('supports dependency-injected S3Client', async () => {
    s3Mock.on(ListBucketsCommand).resolves({ Buckets: [{ Name: 'di-bucket' }] });
    const client = new S3Client({ region: 'us-east-1' });
    const wrapper = new S3Wrapper({ bucket: 'di-bucket' }, client);
    const list = await wrapper.getBuckets();
    expect(list).toEqual([{ Name: 'di-bucket' }]);
  });

  it('throws "Bucket not defined" across all bucket-requiring methods when bucket is empty', () => {
    const client = new S3Client({ region: 'us-east-1' });
    const wrapper = new S3Wrapper({ bucket: '' }, client);

    expect(() => wrapper.createBucket()).toThrow('Bucket not defined');
    expect(() => wrapper.removeBucket()).toThrow('Bucket not defined');
    expect(() => wrapper.bucketExist()).toThrow('Bucket not defined');
    expect(() => wrapper.getFiles()).toThrow('Bucket not defined');
    expect(() => wrapper.fileInfo('a.txt')).toThrow('Bucket not defined');
    expect(() => wrapper.fileExist('a.txt')).toThrow('Bucket not defined');
    expect(() => wrapper.uploadFile('a.txt')).toThrow('Bucket not defined');
    expect(() => wrapper.uploadFiles('a.txt')).toThrow('Bucket not defined');
    expect(() => wrapper.uploadStream(Readable.from([]), 'a.txt')).toThrow('Bucket not defined');
    expect(() => wrapper.downloadFile('a.txt', '/tmp/a.txt')).toThrow('Bucket not defined');
    expect(() => wrapper.deleteAllContent()).toThrow('Bucket not defined');
    expect(() => wrapper.cleanOlder('7d')).toThrow('Bucket not defined');
  });
});
