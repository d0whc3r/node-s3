import fs, { ReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  _Object,
  CompleteMultipartUploadCommandOutput,
  Delete,
  DeleteObjectsCommand,
  DeleteObjectsCommandOutput,
  GetObjectCommand,
  GetObjectCommandOutput,
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
import { UploadOptions, UploadOptionsBasic } from '../types';
import { S3WrapperBuckets } from './buckets';

export class S3WrapperFiles {
  private s3Buckets?: S3WrapperBuckets;
  private readonly defaultUploadOptions: UploadOptionsBasic = { create: true, replace: false };

  constructor(private readonly s3Sdk: S3Client) {}

  public setBucketWrapper(s3Buckets: S3WrapperBuckets) {
    this.s3Buckets = s3Buckets;
  }

  public async getFiles(bucket: string): Promise<_Object[]> {
    try {
      const data = await this.s3Sdk.send(new ListObjectsV2Command({ Bucket: bucket }));
      return data.Contents || [];
    } catch (error) {
      throw error instanceof Error ? error.message : String(error);
    }
  }

  public async fileInfo(bucket: string, name: string): Promise<GetObjectCommandOutput> {
    try {
      return await this.s3Sdk.send(new GetObjectCommand({ Bucket: bucket, Key: name }));
    } catch (error) {
      throw error instanceof Error ? error.message : String(error);
    }
  }

  public async fileExist(bucket: string, name: string): Promise<boolean> {
    try {
      await this.fileInfo(bucket, name);
      return true;
    } catch {
      return false;
    }
  }

  public async deleteAllContent(bucket: string) {
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
    const destination = [folderName, name].filter(Boolean).join('/');
    const mimeType = mime.contentType(name) || undefined;
    const opts = { ...this.defaultUploadOptions, ...options };
    const expire = this.getExpire(opts);
    await this.createIfNeeded(opts, bucket);
    const replaced = await this.canBeReplaced(opts, bucket, destination);

    if (!replaced) {
      throw new Error(`${Config.TAG} File "${destination}" already exists in bucket "${bucket}" and will not be replaced`);
    }

    const readStream = fs.createReadStream(file);
    try {
      const upload = new Upload({
        client: this.s3Sdk,
        params: {
          Key: destination,
          Bucket: bucket,
          Body: readStream,
          Expires: expire,
          ContentType: mimeType
        }
      });
      return await upload.done();
    } catch (error) {
      throw error instanceof Error ? error.message : String(error);
    } finally {
      readStream.destroy();
    }
  }

  public async uploadFiles(bucket: string, files: string | string[], folderName?: string, options: UploadOptions = {}) {
    const { compress, replace, create, expire, expireDate, baseDir } = options;
    if (!Array.isArray(files)) {
      files = [files];
    }
    const uploadFiles = await this.getUploadFiles(compress, files);
    let result: Record<string, CompleteMultipartUploadCommandOutput> = {};
    for (const file of uploadFiles) {
      if (file.includes('*')) {
        const dir = baseDir;
        options.baseDir = file.replace('*', '');
        const response = await this.uploadFiles(bucket, fs.globSync(file), this.extractBaseDir(file, dir, folderName), options);
        result = { ...result, ...response };
      } else if (fs.lstatSync(file).isDirectory()) {
        const dir = baseDir;
        options.baseDir = file;
        const response = await this.uploadFiles(bucket, fs.globSync(`${file}/*`), this.extractBaseDir(file, dir, folderName), options);
        result = { ...result, ...response };
      } else {
        result[file] = await this.uploadFile(bucket, file, folderName, { replace, create, expireDate, expire });
      }
    }
    return result;
  }

  public async cleanOlder(bucket: string, timeSpace: string, folderName?: string) {
    const { value, unit } = this.getTimeSpace(timeSpace);
    const limit = dayjs().subtract(value, unit as ManipulateType);
    const files = await this.getFilesInFolder(bucket, folderName);
    const filesToDelete: ObjectIdentifier[] = files
      .filter((file): file is _Object & { Key: string } => Boolean(file.Key && file.LastModified && dayjs(file.LastModified).isBefore(limit)))
      .map((file) => ({ Key: file.Key }));
    return this.deleteFiles(bucket, filesToDelete);
  }

  public createDumpFile() {
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
    return mysqldump({
      connection: {
        host,
        port,
        user,
        password,
        database
      }
    }).then(({ dump }) => {
      const folder = os.tmpdir();
      const fileDest = path.join(folder, `mysqldump-${dayjs().format('YYYY-MM-DD.HHmmss')}.sql`);
      fs.mkdirSync(path.dirname(fileDest), { recursive: true });
      const content = Object.values(dump)
        .map((result) => result && result.replace(/^# /gm, '-- '))
        .join('\n\n');
      fs.writeFileSync(fileDest, content);
      return fileDest;
    });
  }

  private extractBaseDir(file: string, baseDir?: string, folderName?: string) {
    return baseDir ? path.join(folderName || '', path.relative(baseDir, file)) : folderName;
  }

  private async getUploadFiles(compress: string | boolean | undefined, files: string[]) {
    let uploadFiles = files;
    if (compress) {
      let zipName = compress;
      if (typeof zipName !== 'string') {
        zipName = `zipped_${dayjs().format('YYYY-MM-DD.HHmmss')}.zip`;
      }
      const result = await this.compressFiles(files, zipName);
      uploadFiles = [result];
    }
    return uploadFiles;
  }

  private async canBeReplaced(opts: UploadOptionsBasic, bucket: string, destination: string) {
    if (!opts.replace) {
      const exist = await this.fileExist(bucket, destination);
      if (exist) {
        return false;
      }
    }
    return true;
  }

  private async createIfNeeded(opts: UploadOptionsBasic, bucket: string) {
    if (opts.create && this.s3Buckets) {
      const exist = await this.s3Buckets.bucketExist(bucket);
      if (!exist) {
        await this.s3Buckets.createBucket(bucket);
      }
    }
  }

  private getExpire(opts: UploadOptionsBasic) {
    let expire: Date | undefined;
    if (opts.expireDate) {
      expire = opts.expireDate;
    } else if (opts.expire) {
      const { value, unit } = this.getTimeSpace(opts.expire);
      expire = dayjs()
        .add(+value, unit as ManipulateType)
        .toDate();
    }
    return expire;
  }

  private getTimeSpace(timeSpace: string) {
    const [, value, unit] = /(\d+)(\w+)/.exec(timeSpace) || [];
    if (value === undefined || !unit) {
      throw new Error(`${Config.TAG} Unknown time definition`);
    }
    return { value: +value, unit };
  }

  private async deleteFiles(bucket: string, files: ObjectIdentifier[]): Promise<DeleteObjectsCommandOutput> {
    const objects = files.filter((f) => Boolean(f.Key));
    if (!objects.length) {
      console.info(`${Config.TAG} No files deleted`);
      return { Deleted: [], Errors: [], $metadata: {} };
    }
    const filesToDelete: Delete = { Objects: objects };
    try {
      const data = await this.s3Sdk.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: filesToDelete }));
      const { Deleted } = data;
      if (Deleted && Deleted.length) {
        Deleted.forEach((f) => {
          if (f.Key) {
            console.warn(`${Config.TAG} Deleted file: ${f.Key}`);
          }
        });
      } else {
        console.info(`${Config.TAG} No files deleted`);
      }
      return data;
    } catch (error) {
      throw error instanceof Error ? error.message : String(error);
    }
  }

  private compressFiles(files: string[], outputName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const folder = os.tmpdir();
      const fileDest = path.resolve(folder, outputName);
      fs.mkdirSync(path.dirname(fileDest), { recursive: true });
      const output = fs.createWriteStream(fileDest);
      const readStreams: ReadStream[] = [];
      const archive = new ZipArchive({
        zlib: { level: 9 }
      });
      output.on('close', () => {
        resolve(fileDest);
        output.destroy();
      });

      archive.on('warning', (err) => {
        console.warn(`${Config.TAG} Warning compressing file`, err);
        if (err.code !== 'ENOENT') {
          reject(err);
        }
      });

      archive.on('error', (err) => {
        console.error(`${Config.TAG} Error compressing file`);
        reject(err);
      });
      archive.pipe(output);

      files.forEach((file) => {
        if (file.includes('*')) {
          archive.glob(file);
        } else if (fs.lstatSync(file).isDirectory()) {
          archive.directory(file, false);
        } else {
          const name = path.basename(file);
          const readStream = fs.createReadStream(file);
          archive.append(readStream, { name });
          readStreams.push(readStream);
        }
      });

      void archive.finalize().finally(() => {
        readStreams.forEach((r) => {
          r.destroy();
        });
      });
    });
  }

  private async getFilesInFolder(bucket: string, folderName?: string) {
    let files = await this.getFiles(bucket);
    if (folderName) {
      const regexp = new RegExp(`^${folderName}/`);
      files = files.filter((file) => regexp.test(file.Key || ''));
    }
    return files;
  }
}
