import path from 'node:path';
import { Readable } from 'node:stream';
import { _Object } from '@aws-sdk/client-s3';
import { dumpDatabase, S3Wrapper, UploadOptions } from '../src';
import { Config } from '../src/config';
import { S3Options } from './cliconfig';

export class Cli {
  private readonly s3Wrapper: S3Wrapper;
  private readonly isQuiet: boolean;
  private readonly isJson: boolean;

  constructor(
    private readonly opts: S3Options,
    s3Wrapper?: S3Wrapper
  ) {
    this.isJson = Boolean(opts.json);
    this.isQuiet = Boolean(opts.quiet || opts.json);
    if (s3Wrapper) {
      this.s3Wrapper = s3Wrapper;
    } else {
      const logger = this.isQuiet ? { info: () => undefined, warn: () => undefined, error: console.error } : console;
      this.s3Wrapper = new S3Wrapper({
        endpoint: opts.endpoint,
        bucket: opts.bucket,
        region: opts.region,
        dryRun: opts.dryRun,
        logger
      });
    }
  }

  async parseOptions(): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};

    if (this.opts.backup?.length) {
      results.backup = await this.backup(this.opts.backup);
    }
    if (this.opts.stdin) {
      results.stdin = await this.backupStdin();
    }
    if (this.opts.download) {
      results.download = await this.download(this.opts.download, this.opts.output);
    }
    if (this.opts.delete?.length) {
      results.delete = await this.delete(this.opts.delete, this.opts.folder);
    }
    if (this.opts.db || this.opts.dbUrl) {
      results.db = await this.backupDatabase();
    } else if (this.opts.mysql) {
      results.mysql = await this.dumpMysql();
    }
    if (this.opts.list) {
      results.list = await this.showList();
    }

    if (this.isJson) {
      console.info(JSON.stringify(results, null, 2));
    }

    return results;
  }

  async showList(): Promise<_Object[]> {
    const files = await this.s3Wrapper.getFiles(undefined, this.opts.folder);
    if (!this.isQuiet) {
      if (files.length) {
        console.info(`${Config.TAG} File list in bucket "${this.s3Wrapper.bucket}": ${files.length}`);
        this.beautifulFiles(files);
      } else {
        console.info(`${Config.TAG} No files found in bucket "${this.s3Wrapper.bucket}"`);
      }
    }
    return files;
  }

  async delete(args: string | string[], folderName?: string) {
    const list = Array.isArray(args) ? args : [args];
    const parsed = list.map((arg) => {
      const entry = this.parseDelete(arg);
      return {
        folder: entry.folder || folderName || undefined,
        timeSpace: entry.timeSpace
      };
    });

    return Promise.all(
      parsed.map((info) =>
        this.s3Wrapper.cleanOlder(info.timeSpace, info.folder, undefined, {
          dryRun: this.opts.dryRun,
          keepLast: this.opts.keepLast
        })
      )
    );
  }

  async backup(files: string | string[], overrides: Partial<S3Options> = {}) {
    const merged = { ...this.opts, ...overrides };
    const fileList = Array.isArray(files) ? files : [files];
    const encryptKey = this.resolveEncryptionKey(merged.encrypt);

    const uploadOptions: UploadOptions = {
      compress: merged.zip || merged.zip === null,
      replace: merged.replace,
      create: merged.create,
      storageClass: merged.storageClass,
      acl: merged.acl,
      serverSideEncryption: merged.sse,
      kmsKeyId: merged.kmsKeyId,
      expire: merged.expire,
      exclude: merged.exclude,
      dryRun: merged.dryRun,
      encryptKey
    };

    return this.s3Wrapper.uploadFiles(fileList, merged.folder || undefined, uploadOptions);
  }

  async backupStdin(inputStream: Readable = process.stdin) {
    if (!this.opts.name) {
      throw new Error(`${Config.TAG} --name <filename> is required when using --stdin`);
    }
    const encryptKey = this.resolveEncryptionKey(this.opts.encrypt);

    return this.s3Wrapper.uploadStream(inputStream, this.opts.name, this.opts.folder || undefined, {
      replace: this.opts.replace,
      create: this.opts.create,
      storageClass: this.opts.storageClass,
      acl: this.opts.acl,
      serverSideEncryption: this.opts.sse,
      kmsKeyId: this.opts.kmsKeyId,
      expire: this.opts.expire,
      dryRun: this.opts.dryRun,
      encryptKey
    });
  }

  async download(key: string, outputPath?: string) {
    const dest = outputPath || path.basename(key);
    const decryptKey = this.resolveEncryptionKey(this.opts.encrypt);
    const savedPath = await this.s3Wrapper.downloadFile(key, dest, { decryptKey });
    if (!this.isQuiet) {
      console.info(`${Config.TAG} Downloaded "${key}" to "${savedPath}"`);
    }
    return savedPath;
  }

  async backupDatabase(overrides: Partial<S3Options> = {}) {
    const merged = { ...this.opts, ...overrides };
    const engine = merged.db || (merged.mysql ? 'mysql' : undefined);
    const wantsZip = Boolean(merged.zip || merged.zip === null);

    const dump = await dumpDatabase({
      engine,
      url: merged.dbUrl,
      format: merged.dbFormat,
      preferFile: wantsZip,
      filename: merged.name,
      tag: Config.TAG
    });

    try {
      if (dump.kind === 'stream') {
        const encryptKey = this.resolveEncryptionKey(merged.encrypt);
        const uploaded = await this.s3Wrapper.uploadStream(dump.stream, dump.filename, merged.folder || undefined, {
          replace: merged.replace,
          create: merged.create,
          storageClass: merged.storageClass,
          acl: merged.acl,
          serverSideEncryption: merged.sse,
          kmsKeyId: merged.kmsKeyId,
          expire: merged.expire,
          dryRun: merged.dryRun,
          encryptKey
        });
        await dump.wait();
        return uploaded;
      }

      return await this.backup(dump.filePath, overrides);
    } finally {
      await dump.cleanup();
    }
  }

  async dumpMysql(overrides: Partial<S3Options> = {}) {
    return this.backupDatabase({ ...overrides, db: 'mysql' });
  }

  private resolveEncryptionKey(encrypt?: boolean): string | undefined {
    if (!encrypt) {
      return undefined;
    }
    const key = Config.BACKUP_ENCRYPTION_KEY;
    if (!key) {
      throw new Error(`${Config.TAG} --encrypt requires the $BACKUP_ENCRYPTION_KEY environment variable to be set`);
    }
    return key;
  }

  private parseDelete(arg: string) {
    const eqIndex = arg.indexOf('=');
    if (eqIndex !== -1) {
      return {
        folder: arg.slice(0, eqIndex),
        timeSpace: arg.slice(eqIndex + 1)
      };
    }
    return {
      folder: null,
      timeSpace: arg
    };
  }

  private beautifulFiles(files: _Object[]) {
    const parsed = files.map((file) => file.Key).filter((k): k is string => Boolean(k));
    parsed.sort((a, b) => a.localeCompare(b));
    parsed.forEach((file) => {
      console.info(file);
    });
  }
}
