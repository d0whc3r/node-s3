import fs, { ReadStream } from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  _Object,
  CompleteMultipartUploadCommandOutput,
  Delete,
  DeleteObjectsCommand,
  DeleteObjectsCommandOutput,
  DeletedObject,
  _Error as S3DeleteError,
  GetObjectCommand,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  ListObjectsV2Command,
  ObjectIdentifier,
  S3Client
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { ZipArchive } from 'archiver';
import dayjs, { ManipulateType } from 'dayjs';
import mime from 'mime-types';
import mysqldump from 'mysqldump';
import { Config } from '../config';
import { createDecryptStream, createEncryptStream } from '../crypto';
import { CleanOlderOptions, DownloadOptions, Logger, UploadOptions, UploadOptionsBasic, UploadProgress } from '../types';
import { isNotFoundError, wrapS3Error } from './buckets';

const TIME_SPACE_REGEX = /^(\d+)(s|m|h|d|w|M|y|seconds?|minutes?|hours?|days?|weeks?|months?|years?)$/;

const TIME_UNIT_MAP: Record<string, ManipulateType> = {
  s: 'second',
  second: 'second',
  seconds: 'second',
  m: 'minute',
  minute: 'minute',
  minutes: 'minute',
  h: 'hour',
  hour: 'hour',
  hours: 'hour',
  d: 'day',
  day: 'day',
  days: 'day',
  w: 'week',
  week: 'week',
  weeks: 'week',
  M: 'month',
  month: 'month',
  months: 'month',
  y: 'year',
  year: 'year',
  years: 'year'
};

const MAX_DELETE_BATCH_SIZE = 1000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_COMPRESSION_LEVEL = 6;

export interface S3WrapperFilesOptions {
  ensureBucket?: (bucket: string) => Promise<void>;
  logger?: Logger;
  dryRun?: boolean;
  onProgress?: (progress: UploadProgress) => void;
}

export function normalizeS3Key(...segments: (string | undefined)[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    if (!segment) {
      continue;
    }
    const normalized = segment.replace(/\\/g, '/');
    for (const part of normalized.split('/')) {
      if (!part || part === '.') {
        continue;
      }
      if (part === '..') {
        throw new Error(`${Config.TAG} Invalid S3 key segment ".." in "${segment}"`);
      }
      parts.push(part);
    }
  }
  return path.posix.join(...parts);
}

function normalizePrefix(folderName?: string): string | undefined {
  if (!folderName) {
    return undefined;
  }
  const normalized = normalizeS3Key(folderName);
  return normalized ? `${normalized}/` : undefined;
}

function extractGlobBase(pattern: string): string {
  const globCharIndex = pattern.search(/[*?[{]/);
  if (globCharIndex === -1) {
    return pattern;
  }
  const prefix = pattern.slice(0, globCharIndex);
  if (!prefix) {
    return '.';
  }
  if (prefix.endsWith('/') || prefix.endsWith('\\')) {
    return prefix.slice(0, -1) || '.';
  }
  return path.dirname(prefix);
}

function isExcluded(filePath: string, excludePatterns: string[]): boolean {
  if (!excludePatterns.length) {
    return false;
  }
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.posix.basename(normalized);
  return excludePatterns.some((pattern) => path.matchesGlob(normalized, pattern) || path.matchesGlob(basename, pattern));
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export class S3WrapperFiles {
  private readonly defaultUploadOptions: UploadOptionsBasic = { create: true, replace: false };
  private readonly ensureBucketFn?: (bucket: string) => Promise<void>;
  private readonly logger: Logger;
  private readonly defaultDryRun: boolean;
  private readonly defaultOnProgress?: (progress: UploadProgress) => void;

  constructor(
    private readonly s3Sdk: S3Client,
    options: S3WrapperFilesOptions = {}
  ) {
    this.ensureBucketFn = options.ensureBucket;
    this.logger = options.logger ?? console;
    this.defaultDryRun = options.dryRun ?? false;
    this.defaultOnProgress = options.onProgress;
  }

  public async getFiles(bucket: string, prefix?: string): Promise<_Object[]> {
    const normalizedPrefix = prefix ? normalizePrefix(prefix) : undefined;
    const objects: _Object[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        const data = await this.s3Sdk.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ...(normalizedPrefix ? { Prefix: normalizedPrefix } : {}),
            ...(continuationToken ? { ContinuationToken: continuationToken } : {})
          })
        );
        if (data.Contents) {
          objects.push(...data.Contents);
        }
        continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
      } while (continuationToken);
      return objects;
    } catch (error) {
      throw wrapS3Error(error, `Failed to list files in bucket "${bucket}"`);
    }
  }

  public async fileInfo(bucket: string, name: string): Promise<HeadObjectCommandOutput> {
    const key = normalizeS3Key(name);
    try {
      return await this.s3Sdk.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      throw wrapS3Error(error, `Failed to get info for "${key}" in bucket "${bucket}"`);
    }
  }

  public async fileExist(bucket: string, name: string): Promise<boolean> {
    const key = normalizeS3Key(name);
    try {
      await this.s3Sdk.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw wrapS3Error(error, `Failed to check existence of "${key}" in bucket "${bucket}"`);
    }
  }

  public async deleteAllContent(bucket: string): Promise<DeleteObjectsCommandOutput> {
    const files: ObjectIdentifier[] = (await this.getFiles(bucket))
      .filter((obj): obj is _Object & { Key: string } => Boolean(obj.Key))
      .map((obj) => ({ Key: obj.Key }));
    return this.deleteFiles(bucket, files);
  }

  public async uploadFile(
    bucket: string,
    file: string,
    folderName?: string,
    options?: UploadOptionsBasic
  ): Promise<CompleteMultipartUploadCommandOutput> {
    const name = path.basename(file);
    const destination = normalizeS3Key(folderName, name);
    const opts = { ...this.defaultUploadOptions, ...options };
    const isDryRun = opts.dryRun ?? this.defaultDryRun;

    if (isDryRun) {
      this.logger.info?.(`${Config.TAG} [dry-run] Would upload "${file}" to "s3://${bucket}/${destination}"`);
      return { Bucket: bucket, Key: destination, $metadata: {} };
    }

    const readStream = fs.createReadStream(file);
    try {
      return await this.uploadStream(bucket, readStream, name, folderName, opts);
    } finally {
      readStream.destroy();
    }
  }

  public async uploadStream(
    bucket: string,
    stream: Readable,
    filename: string,
    folderName?: string,
    options?: UploadOptionsBasic
  ): Promise<CompleteMultipartUploadCommandOutput> {
    const safeName = path.basename(filename);
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new Error(`${Config.TAG} Invalid upload filename: "${filename}"`);
    }
    const destination = normalizeS3Key(folderName, safeName);
    const mimeType = mime.contentType(safeName) || undefined;
    const opts = { ...this.defaultUploadOptions, ...options };
    const isDryRun = opts.dryRun ?? this.defaultDryRun;

    if (isDryRun) {
      this.logger.info?.(`${Config.TAG} [dry-run] Would upload stream "${safeName}" to "s3://${bucket}/${destination}"`);
      return { Bucket: bucket, Key: destination, $metadata: {} };
    }

    const expire = this.getExpire(opts);
    if (!opts.skipBucketCheck) {
      await this.createIfNeeded(opts, bucket);
    }
    const replaced = await this.canBeReplaced(opts, bucket, destination);
    if (!replaced) {
      throw new Error(`${Config.TAG} File "${destination}" already exists in bucket "${bucket}" and will not be replaced`);
    }

    let bodyStream: Readable = stream;
    let encryptStream: Readable | undefined;
    if (opts.encryptKey) {
      const cipherStream = createEncryptStream(opts.encryptKey);
      stream.on('error', (err) => {
        cipherStream.destroy(err);
      });
      bodyStream = stream.pipe(cipherStream);
      encryptStream = bodyStream;
    }

    const onProgress = opts.onProgress ?? this.defaultOnProgress;
    try {
      const upload = new Upload({
        client: this.s3Sdk,
        params: {
          Key: destination,
          Bucket: bucket,
          Body: bodyStream,
          Expires: expire,
          ContentType: mimeType,
          ...(opts.storageClass ? { StorageClass: opts.storageClass } : {}),
          ...(opts.acl ? { ACL: opts.acl } : {}),
          ...(opts.serverSideEncryption ? { ServerSideEncryption: opts.serverSideEncryption } : {}),
          ...(opts.kmsKeyId ? { SSEKMSKeyId: opts.kmsKeyId } : {})
        }
      });

      if (onProgress) {
        upload.on('httpUploadProgress', (progress) => {
          onProgress({
            loaded: progress.loaded,
            total: progress.total,
            part: progress.part,
            key: destination
          });
        });
      }

      return await upload.done();
    } catch (error) {
      throw wrapS3Error(error, `Failed to upload "${destination}" to bucket "${bucket}"`);
    } finally {
      encryptStream?.destroy();
    }
  }

  public async uploadFiles(
    bucket: string,
    files: string | string[],
    folderName?: string,
    options: UploadOptions = {}
  ): Promise<Record<string, CompleteMultipartUploadCommandOutput>> {
    const fileList = Array.isArray(files) ? files : [files];
    const opts = { ...this.defaultUploadOptions, ...options };
    const isDryRun = opts.dryRun ?? this.defaultDryRun;
    const excludePatterns = opts.exclude ? (Array.isArray(opts.exclude) ? opts.exclude : [opts.exclude]) : [];
    const followSymlinks = opts.followSymlinks ?? false;

    if (!opts.skipBucketCheck && !isDryRun) {
      await this.createIfNeeded(opts, bucket);
    }

    const baseUploadOpts: UploadOptionsBasic = {
      replace: opts.replace,
      create: opts.create,
      expire: opts.expire,
      expireDate: opts.expireDate,
      storageClass: opts.storageClass,
      acl: opts.acl,
      serverSideEncryption: opts.serverSideEncryption,
      kmsKeyId: opts.kmsKeyId,
      dryRun: opts.dryRun,
      encryptKey: opts.encryptKey,
      onProgress: opts.onProgress,
      skipBucketCheck: true
    };

    if (opts.compress) {
      const zipName = typeof opts.compress === 'string' ? opts.compress : `zipped_${dayjs().format('YYYY-MM-DD.HHmmss')}.zip`;
      const { filePath, tmpDir } = await this.compressFiles(fileList, zipName, {
        compressionLevel: opts.compressionLevel,
        followSymlinks,
        exclude: excludePatterns
      });
      try {
        const response = await this.uploadFile(bucket, filePath, folderName, baseUploadOpts);
        return { [filePath]: response };
      } finally {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      }
    }

    const tasks = await this.collectUploadTasks(fileList, folderName, opts.baseDir, followSymlinks, excludePatterns);
    const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
    const result: Record<string, CompleteMultipartUploadCommandOutput> = {};

    const uploaded = await runWithConcurrency(tasks, concurrency, async (task) => {
      const response = await this.uploadFile(bucket, task.file, task.folderName, baseUploadOpts);
      return { file: task.file, response };
    });

    for (const item of uploaded) {
      result[item.file] = item.response;
    }

    return result;
  }

  public async downloadFile(bucket: string, key: string, destPath: string, options: DownloadOptions = {}): Promise<string> {
    const normalizedKey = normalizeS3Key(key);
    try {
      const data = await this.s3Sdk.send(new GetObjectCommand({ Bucket: bucket, Key: normalizedKey }));
      if (!data.Body) {
        throw new Error(`${Config.TAG} Empty response body for "${normalizedKey}"`);
      }

      await fsp.mkdir(path.dirname(path.resolve(destPath)), { recursive: true });
      const bodyStream = data.Body as Readable;
      const writeStream = fs.createWriteStream(destPath);

      if (options.decryptKey) {
        const decryptStream = createDecryptStream(options.decryptKey);
        await pipeline(bodyStream, decryptStream, writeStream);
      } else {
        await pipeline(bodyStream, writeStream);
      }

      return destPath;
    } catch (error) {
      throw wrapS3Error(error, `Failed to download "${normalizedKey}" from bucket "${bucket}"`);
    }
  }

  public async cleanOlder(
    bucket: string,
    timeSpace: string,
    folderName?: string,
    options: CleanOlderOptions = {}
  ): Promise<DeleteObjectsCommandOutput> {
    const { value, unit } = this.getTimeSpace(timeSpace);
    const limit = dayjs().subtract(value, unit);
    const files = await this.getFiles(bucket, folderName);

    const validFiles = files.filter((file): file is _Object & { Key: string } => Boolean(file.Key && file.LastModified));
    validFiles.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    const keepLast = options.keepLast ?? 0;
    const candidates = keepLast > 0 ? validFiles.slice(keepLast) : validFiles;

    const filesToDelete: ObjectIdentifier[] = candidates
      .filter((file) => dayjs(file.LastModified).isBefore(limit))
      .map((file) => ({ Key: file.Key }));

    const isDryRun = options.dryRun ?? this.defaultDryRun;
    if (isDryRun) {
      for (const f of filesToDelete) {
        if (f.Key) {
          this.logger.info?.(`${Config.TAG} [dry-run] Would delete file: ${f.Key}`);
        }
      }
      return {
        Deleted: filesToDelete.map((f) => ({ Key: f.Key })),
        Errors: [],
        $metadata: {}
      };
    }

    return this.deleteFiles(bucket, filesToDelete);
  }

  public async createDumpFile(): Promise<string> {
    const host = Config.MYSQL_HOST;
    const port = Config.MYSQL_PORT;
    const user = Config.MYSQL_USER;
    const password = Config.MYSQL_PASSWORD;
    const database = Config.MYSQL_DATABASE;
    if (!user || !password || !database) {
      throw new Error(
        `${Config.TAG} Error in mysql-dump environment variables not defined: $MYSQL_USER, $MYSQL_PASSWORD, $MYSQL_DATABASE, $MYSQL_HOST, $MYSQL_PORT`
      );
    }

    const { dump } = await mysqldump({
      connection: {
        host,
        port,
        user,
        password,
        database
      }
    });

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'node-s3-dump-'));
    await fsp.chmod(tmpDir, 0o700);
    const fileDest = path.join(tmpDir, `mysqldump-${dayjs().format('YYYY-MM-DD.HHmmss')}.sql`);
    const content = Object.values(dump)
      .map((result) => result && result.replace(/^# /gm, '-- '))
      .join('\n\n');
    await fsp.writeFile(fileDest, content, { mode: 0o600 });
    return fileDest;
  }

  public async deleteFiles(bucket: string, files: ObjectIdentifier[]): Promise<DeleteObjectsCommandOutput> {
    const objects = files.filter((f) => Boolean(f.Key));
    if (!objects.length) {
      this.logger.info?.(`${Config.TAG} No files deleted`);
      return { Deleted: [], Errors: [], $metadata: {} };
    }

    const allDeleted: DeletedObject[] = [];
    const allErrors: S3DeleteError[] = [];
    let lastMetadata: DeleteObjectsCommandOutput['$metadata'] = {};

    try {
      for (let i = 0; i < objects.length; i += MAX_DELETE_BATCH_SIZE) {
        const chunk = objects.slice(i, i + MAX_DELETE_BATCH_SIZE);
        const filesToDelete: Delete = { Objects: chunk };
        const data = await this.s3Sdk.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: filesToDelete }));
        lastMetadata = data.$metadata;

        if (data.Deleted?.length) {
          allDeleted.push(...data.Deleted);
          for (const f of data.Deleted) {
            if (f.Key) {
              this.logger.warn?.(`${Config.TAG} Deleted file: ${f.Key}`);
            }
          }
        }
        if (data.Errors?.length) {
          allErrors.push(...data.Errors);
        }
      }
    } catch (error) {
      throw wrapS3Error(error, `Failed to delete files from bucket "${bucket}"`);
    }

    if (allErrors.length > 0) {
      const summary = allErrors.map((e) => `${e.Key ?? 'unknown'} (${e.Code ?? 'Error'}: ${e.Message ?? 'unknown error'})`).join('; ');
      throw new Error(`${Config.TAG} Failed to delete ${allErrors.length} file(s) from bucket "${bucket}": ${summary}`);
    }

    if (!allDeleted.length) {
      this.logger.info?.(`${Config.TAG} No files deleted`);
    }

    return {
      Deleted: allDeleted,
      Errors: allErrors,
      $metadata: lastMetadata
    };
  }

  private async collectUploadTasks(
    files: string[],
    folderName: string | undefined,
    baseDir: string | undefined,
    followSymlinks: boolean,
    excludePatterns: string[]
  ): Promise<Array<{ file: string; folderName?: string }>> {
    const tasks: Array<{ file: string; folderName?: string }> = [];

    for (const file of files) {
      if (file.includes('*')) {
        const globBase = extractGlobBase(file);
        const matched = fs.globSync(file);
        const nextFolder = this.extractBaseDir(globBase, baseDir, folderName);
        const nested = await this.collectUploadTasks(matched, nextFolder, globBase, followSymlinks, excludePatterns);
        tasks.push(...nested);
        continue;
      }

      const stat = await fsp.lstat(file);
      if (stat.isSymbolicLink()) {
        if (!followSymlinks) {
          this.logger.warn?.(`${Config.TAG} Skipping symlink: ${file}`);
          continue;
        }
        const targetStat = await fsp.stat(file);
        if (targetStat.isDirectory()) {
          const entries = (await fsp.readdir(file)).map((entry) => path.join(file, entry));
          const nextFolder = this.extractBaseDir(file, baseDir, folderName);
          const nested = await this.collectUploadTasks(entries, nextFolder, file, followSymlinks, excludePatterns);
          tasks.push(...nested);
          continue;
        }
      } else if (stat.isDirectory()) {
        const entries = (await fsp.readdir(file)).map((entry) => path.join(file, entry));
        const nextFolder = this.extractBaseDir(file, baseDir, folderName);
        const nested = await this.collectUploadTasks(entries, nextFolder, file, followSymlinks, excludePatterns);
        tasks.push(...nested);
        continue;
      }

      if (isExcluded(file, excludePatterns)) {
        continue;
      }

      tasks.push({ file, folderName });
    }

    return tasks;
  }

  private extractBaseDir(file: string, baseDir?: string, folderName?: string): string | undefined {
    if (!baseDir) {
      return folderName;
    }
    const rel = path.relative(baseDir, file);
    if (!rel || rel === '.') {
      return folderName;
    }
    return normalizeS3Key(folderName, rel);
  }

  private async canBeReplaced(opts: UploadOptionsBasic, bucket: string, destination: string): Promise<boolean> {
    if (!opts.replace) {
      const exist = await this.fileExist(bucket, destination);
      if (exist) {
        return false;
      }
    }
    return true;
  }

  private async createIfNeeded(opts: UploadOptionsBasic, bucket: string): Promise<void> {
    if (opts.create && this.ensureBucketFn) {
      await this.ensureBucketFn(bucket);
    }
  }

  private getExpire(opts: UploadOptionsBasic): Date | undefined {
    if (opts.expireDate) {
      return opts.expireDate;
    }
    if (opts.expire) {
      const { value, unit } = this.getTimeSpace(opts.expire);
      return dayjs().add(value, unit).toDate();
    }
    return undefined;
  }

  private getTimeSpace(timeSpace: string): { value: number; unit: ManipulateType } {
    const match = TIME_SPACE_REGEX.exec(timeSpace);
    if (!match) {
      throw new Error(`${Config.TAG} Invalid time definition "${timeSpace}". Expected format like "30s", "15m", "24h", "7d", "2w", "1M", or "1y"`);
    }
    const value = Number(match[1]);
    const unit = TIME_UNIT_MAP[match[2]];
    if (!unit || Number.isNaN(value)) {
      throw new Error(`${Config.TAG} Invalid time unit in "${timeSpace}"`);
    }
    return { value, unit };
  }

  private compressFiles(
    files: string[],
    outputName: string,
    options: { compressionLevel?: number; followSymlinks?: boolean; exclude?: string[] } = {}
  ): Promise<{ filePath: string; tmpDir: string }> {
    const safeName = path.basename(outputName);
    if (!safeName || safeName === '.' || safeName === '..' || safeName.includes('*')) {
      return Promise.reject(new Error(`${Config.TAG} Invalid archive filename: "${outputName}"`));
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-s3-'));
    fs.chmodSync(tmpDir, 0o700);
    const fileDest = path.join(tmpDir, safeName);
    const followSymlinks = options.followSymlinks ?? false;
    const excludePatterns = options.exclude ?? [];

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(fileDest, { mode: 0o600 });
      const readStreams: ReadStream[] = [];
      let settled = false;

      const fail = (err: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        readStreams.forEach((r) => r.destroy());
        output.destroy();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const archive = new ZipArchive({
        zlib: { level: options.compressionLevel ?? DEFAULT_COMPRESSION_LEVEL }
      });

      output.on('close', () => {
        if (!settled) {
          settled = true;
          resolve({ filePath: fileDest, tmpDir });
        }
        output.destroy();
      });

      output.on('error', fail);

      archive.on('warning', (err) => {
        this.logger.warn?.(`${Config.TAG} Warning compressing file`, err);
        if (err.code !== 'ENOENT') {
          fail(err);
        }
      });

      archive.on('error', fail);
      archive.pipe(output);

      try {
        for (const file of files) {
          if (file.includes('*')) {
            archive.glob(file, excludePatterns.length ? { ignore: excludePatterns } : undefined);
          } else {
            const stat = fs.lstatSync(file);
            if (stat.isSymbolicLink() && !followSymlinks) {
              this.logger.warn?.(`${Config.TAG} Skipping symlink in archive: ${file}`);
              continue;
            }
            const effectiveStat = stat.isSymbolicLink() ? fs.statSync(file) : stat;
            if (effectiveStat.isDirectory()) {
              archive.directory(file, false, (entry) => {
                if (isExcluded(entry.name, excludePatterns)) {
                  return false;
                }
                return entry;
              });
            } else {
              if (isExcluded(file, excludePatterns)) {
                continue;
              }
              const name = path.basename(file);
              const readStream = fs.createReadStream(file);
              readStream.on('error', fail);
              archive.append(readStream, { name });
              readStreams.push(readStream);
            }
          }
        }
      } catch (err) {
        fail(err);
        return;
      }

      void archive.finalize().catch(fail);
    });
  }
}
