import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUsageGuide, parseCliArgs } from '../cli/cliconfig';
import { Cli } from '../cli/climodule';
import { S3Wrapper } from '../src';
import { Config } from '../src/config';

function createMockWrapper() {
  return {
    bucket: 'test-bucket',
    getFiles: vi.fn().mockResolvedValue([{ Key: 'b.txt' }, { Key: 'a.txt' }]),
    uploadFiles: vi.fn().mockResolvedValue({ 'file.txt': { Key: 'file.txt' } }),
    uploadStream: vi.fn().mockResolvedValue({ Key: 'stdin.sql' }),
    downloadFile: vi.fn().mockResolvedValue('/tmp/out.txt'),
    cleanOlder: vi.fn().mockResolvedValue({ Deleted: [{ Key: 'old.txt' }] }),
    createDumpFile: vi.fn()
  } as unknown as S3Wrapper;
}

describe('CLI (unit)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Config.resetOverrides();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    Config.resetOverrides();
    vi.unstubAllEnvs();
  });

  describe('parseCliArgs & getUsageGuide', () => {
    it('parses all supported flags cleanly', () => {
      const opts = parseCliArgs([
        '-e',
        'https://s3.example.com',
        '--bucket',
        'my-bucket',
        '--region',
        'eu-central-1',
        '-b',
        'a.txt',
        '-b',
        'b.txt',
        '-z',
        'out.zip',
        '-r',
        '-c',
        '-f',
        'daily',
        '-d',
        'daily=7d',
        '--keep-last',
        '3',
        '--download',
        'daily/out.zip',
        '-o',
        './restore.zip',
        '--encrypt',
        '--dry-run',
        '--storage-class',
        'STANDARD_IA',
        '--sse',
        'aws:kms',
        '--kms-key-id',
        'key-1',
        '--acl',
        'private',
        '--expire',
        '30d',
        '--exclude',
        '*.log',
        '--exclude',
        '*.tmp',
        '--stdin',
        '--name',
        'pipe.sql',
        '--json',
        '-q',
        '-v',
        '-h'
      ]);

      expect(opts).toEqual({
        endpoint: 'https://s3.example.com',
        bucket: 'my-bucket',
        region: 'eu-central-1',
        backup: ['a.txt', 'b.txt'],
        zip: 'out.zip',
        replace: true,
        create: true,
        folder: 'daily',
        delete: ['daily=7d'],
        keepLast: 3,
        download: 'daily/out.zip',
        output: './restore.zip',
        encrypt: true,
        dryRun: true,
        storageClass: 'STANDARD_IA',
        sse: 'aws:kms',
        kmsKeyId: 'key-1',
        acl: 'private',
        expire: '30d',
        exclude: ['*.log', '*.tmp'],
        stdin: true,
        name: 'pipe.sql',
        json: true,
        quiet: true,
        version: true,
        help: true
      });
    });

    it('throws on unknown flags', () => {
      expect(() => parseCliArgs(['--unknown-flag'])).toThrow();
    });

    it('generates usage guide', () => {
      const guide = getUsageGuide();
      expect(guide).toContain('Help for node-s3');
      expect(guide).toContain('--keep-last');
      expect(guide).toContain('--download');
      expect(guide).toContain('--encrypt');
    });
  });

  describe('Cli methods', () => {
    it('lists files and supports --json output', async () => {
      const wrapper = createMockWrapper();
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

      const cli = new Cli({ list: true, folder: 'daily', json: true }, wrapper);
      const res = await cli.parseOptions();

      expect(wrapper.getFiles).toHaveBeenCalledWith(undefined, 'daily');
      expect(res.list).toHaveLength(2);
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"list"'));
    });

    it('forwards cloud-native options and encryption key on backup', async () => {
      vi.stubEnv('BACKUP_ENCRYPTION_KEY', 'cli-secret');
      const wrapper = createMockWrapper();

      const cli = new Cli(
        {
          backup: ['file1.txt'],
          folder: 'backups',
          zip: null,
          replace: true,
          create: true,
          storageClass: 'GLACIER',
          acl: 'private',
          sse: 'AES256',
          expire: '14d',
          exclude: ['*.tmp'],
          dryRun: true,
          encrypt: true
        },
        wrapper
      );
      await cli.parseOptions();

      expect(wrapper.uploadFiles).toHaveBeenCalledWith(['file1.txt'], 'backups', {
        compress: true,
        replace: true,
        create: true,
        storageClass: 'GLACIER',
        acl: 'private',
        serverSideEncryption: 'AES256',
        kmsKeyId: undefined,
        expire: '14d',
        exclude: ['*.tmp'],
        dryRun: true,
        encryptKey: 'cli-secret'
      });
    });

    it('throws if --encrypt is used without BACKUP_ENCRYPTION_KEY', async () => {
      vi.stubEnv('BACKUP_ENCRYPTION_KEY', '');
      const wrapper = createMockWrapper();
      const cli = new Cli({ backup: ['a.txt'], encrypt: true }, wrapper);
      await expect(cli.parseOptions()).rejects.toThrowError(/BACKUP_ENCRYPTION_KEY/);
    });

    it('supports --stdin with --name and rejects missing --name', async () => {
      const wrapper = createMockWrapper();
      const cliMissing = new Cli({ stdin: true }, wrapper);
      await expect(cliMissing.backupStdin(Readable.from(['data']))).rejects.toThrowError(/--name/);

      const cliOk = new Cli({ stdin: true, name: 'dump.sql', folder: 'pg' }, wrapper);
      const stream = Readable.from(['SELECT 1;']);
      await cliOk.backupStdin(stream);
      expect(wrapper.uploadStream).toHaveBeenCalledWith(stream, 'dump.sql', 'pg', expect.any(Object));
    });

    it('supports --download with --output and optional --encrypt', async () => {
      vi.stubEnv('BACKUP_ENCRYPTION_KEY', 'dl-secret');
      const wrapper = createMockWrapper();
      vi.spyOn(console, 'info').mockImplementation(() => undefined);

      const cli = new Cli({ download: 'backups/a.zip', output: './a.zip', encrypt: true }, wrapper);
      await cli.parseOptions();
      expect(wrapper.downloadFile).toHaveBeenCalledWith('backups/a.zip', './a.zip', { decryptKey: 'dl-secret' });
    });

    it('runs delete with keepLast/dryRun and does NOT swallow errors', async () => {
      const wrapper = createMockWrapper();
      const cli = new Cli({ delete: ['uploads=7d', '14d'], folder: 'fallback', keepLast: 2, dryRun: true }, wrapper);
      await cli.parseOptions();

      expect(wrapper.cleanOlder).toHaveBeenNthCalledWith(1, '7d', 'uploads', undefined, { dryRun: true, keepLast: 2 });
      expect(wrapper.cleanOlder).toHaveBeenNthCalledWith(2, '14d', 'fallback', undefined, { dryRun: true, keepLast: 2 });

      vi.mocked(wrapper.cleanOlder).mockRejectedValueOnce(new Error('DeleteFailed'));
      await expect(cli.delete(['7d'])).rejects.toThrowError('DeleteFailed');
    });

    it('dumpMysql cleans up temp dump directory even when upload fails', async () => {
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'node-s3-cli-dump-'));
      const dumpFile = path.join(tmpDir, 'mysqldump-test.sql');
      await fsp.writeFile(dumpFile, '-- sql');

      const wrapper = createMockWrapper();
      vi.mocked(wrapper.createDumpFile).mockResolvedValue(dumpFile);
      vi.mocked(wrapper.uploadFiles).mockRejectedValueOnce(new Error('S3Down'));

      const cli = new Cli({ mysql: true, folder: 'db' }, wrapper);
      await expect(cli.parseOptions()).rejects.toThrowError('S3Down');
      expect(fs.existsSync(tmpDir)).toBe(false);
    });
  });
});
