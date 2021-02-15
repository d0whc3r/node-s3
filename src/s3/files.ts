import { Delete, DeleteObjectsOutput, GetObjectOutput, ObjectIdentifierList, ObjectList } from 'aws-sdk/clients/s3';
import { S3WrapperBuckets } from './buckets';
import { UploadOptions, UploadOptionsBasic } from '../types';
import path from 'path';
import mime from 'mime-types';
import dayjs, { OpUnitType } from 'dayjs';
import fs, { ReadStream } from 'fs';
import os from 'os';
import mkdirp from 'mkdirp';
import archiver from 'archiver';
import { Config } from '../config';
import glob from 'glob';
import { ManagedUpload } from 'aws-sdk/lib/s3/managed_upload';
import mysqldump from 'mysqldump';
import { S3 } from 'aws-sdk';

export class S3WrapperFiles {
  private s3Buckets?: S3WrapperBuckets;
  private readonly defaultUploadOptions: UploadOptionsBasic = { create: true, replace: false };

  constructor(private readonly s3Sdk: S3) {}

  public setBucketWrapper(s3Buckets: S3WrapperBuckets) {
    this.s3Buckets = s3Buckets;
  }

  public getFiles(bucket: string) {
    return new Promise<ObjectList>((resolve, reject) => {
      this.s3Sdk.listObjects({ Bucket: bucket }, (error, data) => {
        if (error) {
          reject(error.message);
        } else {
          resolve(data.Contents || []);
        }
      });
    });
  }

  public fileInfo(bucket: string, name: string) {
    return new Promise<GetObjectOutput>((resolve, reject) => {
      this.s3Sdk.getObject({ Bucket: bucket, Key: name }, (error, data) => {
        if (error) {
          reject(error.message);
        } else {
          resolve(data);
        }
      });
    });
  }

  public fileExist(bucket: string, name: string) {
    return new Promise<boolean>((resolve) => {
      this.fileInfo(bucket, name)
        .then(() => resolve(true))
        .catch(() => resolve(false));
    });
  }

  public async deleteAllContent(bucket: string) {
    const files = (await this.getFiles(bucket)).map((obj) => ({ Key: obj.Key })) as ObjectIdentifierList;
    return this.deleteFiles(bucket, files);
  }

  public async uploadFile(bucket: string, file: string, folderName?: string, options?: UploadOptionsBasic) {
    let destination: string;
    let mimeType: string | undefined;
    let expire: Date | undefined;
    let replaced: boolean;
    try {
      const name = path.basename(file);
      destination = [folderName, name].filter(Boolean).join('/');
      mimeType = mime.contentType(name) || undefined;
      const opts = { ...this.defaultUploadOptions, ...(options || {}) };
      expire = this.getExpire(opts);
      await this.createIfNeeded(opts, bucket);
      replaced = await this.canBeReplaced(opts, bucket, destination);
    } catch (e) {
      return Promise.reject(e);
    }
    return new Promise<ManagedUpload.SendData>((resolve, reject) => {
      if (!replaced) {
        return reject(Error(`${Config.TAG} File "${destination}" already exists in bucket "${bucket}" and will not be replaced`));
      }
      const readStream = fs.createReadStream(file);
      const params: S3.Types.PutObjectRequest = {
        Key: destination,
        Bucket: bucket,
        Body: readStream,
        Expires: expire,
        ContentType: mimeType
      };
      this.s3Sdk.upload(params, (error, data) => {
        readStream.destroy();
        if (error) {
          reject(error.message);
        } else {
          resolve(data);
        }
      });
    });
  }

  public async uploadFiles(bucket: string, files: string | string[], folderName?: string, options: UploadOptions = {}) {
    const { compress, replace, create, expire, expireDate, baseDir } = options;
    if (!Array.isArray(files)) {
      files = [files];
    }
    const uploadFiles = await this.getUploadFiles(compress, files);
    let result: { [filename: string]: ManagedUpload.SendData } = {};
    for (const file of uploadFiles) {
      if (file.includes('*')) {
        const dir = baseDir;
        options.baseDir = file.replace('*', '');
        const response = await this.uploadFiles(bucket, glob.sync(file), this.extractBaseDir(file, dir, folderName), options);
        result = { ...result, ...response };
      } else if (fs.lstatSync(file).isDirectory()) {
        const dir = baseDir;
        options.baseDir = file;
        const response = await this.uploadFiles(bucket, glob.sync(`${file}/*`), this.extractBaseDir(file, dir, folderName), options);
        result = { ...result, ...response };
      } else {
        result[file] = await this.uploadFile(bucket, file, folderName, { replace, create, expireDate, expire });
      }
    }
    return result;
  }

  public async cleanOlder(bucket: string, timeSpace: string, folderName?: string) {
    const { value, unit } = this.getTimeSpace(timeSpace);
    const limit = dayjs().subtract(value, unit as OpUnitType);
    const files = await this.getFilesInFolder(bucket, folderName);
    const filesToDelete = files
      .filter((file) => !!file.LastModified && dayjs(file.LastModified).isBefore(limit))
      .map((file) => ({ Key: file.Key })) as ObjectIdentifierList;
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
      mkdirp.sync(path.dirname(fileDest));
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
        .add(+value, unit as OpUnitType)
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

  private deleteFiles(bucket: string, files: ObjectIdentifierList) {
    return new Promise<DeleteObjectsOutput>((resolve, reject) => {
      const filesToDelete: Delete = { Objects: files.filter((f) => !!f.Key) };
      this.s3Sdk.deleteObjects({ Bucket: bucket, Delete: filesToDelete }, (error, data) => {
        if (error) {
          reject(error.message);
        } else {
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
          resolve(data);
        }
      });
    });
  }

  private compressFiles(files: string[], outputName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const folder = os.tmpdir();
      const fileDest = path.resolve(folder, outputName);
      mkdirp.sync(path.dirname(fileDest));
      const output = fs.createWriteStream(fileDest);
      const readStreams: ReadStream[] = [];
      const archive = archiver('zip', {
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

      archive.finalize().finally(() => {
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
