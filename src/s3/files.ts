import S3, { Delete, DeleteObjectOutput, GetObjectOutput, Object, ObjectIdentifierList } from 'aws-sdk/clients/s3';
import { S3WrapperBuckets } from './buckets';
import { UploadOptions, UploadOptionsBasic } from '../types';
import path from 'path';
import mime from 'mime-types';
import dayjs, { OpUnitType } from 'dayjs';
import fs, { ReadStream } from 'fs';
import os from 'os';
import FileUtils from '../file.utils';
import archiver from 'archiver';
import { Config } from '../config';
import glob from 'glob';
import { ManagedUpload } from 'aws-sdk/lib/s3/managed_upload';
import mysqldump from 'mysqldump';
import SendData = ManagedUpload.SendData;

export class S3WrapperFiles {
  private s3Buckets?: S3WrapperBuckets;

  constructor(private s3Sdk: S3) {
  }

  public setBucketWrapper(s3Buckets: S3WrapperBuckets) {
    this.s3Buckets = s3Buckets;
  }

  public getFiles(bucket: string) {
    return new Promise<Object[]>((resolve, reject) => {
      this.s3Sdk.listObjects({ Bucket: bucket }, (error, data) => {
        if (error) {
          reject(error);
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
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  public fileExist(bucket: string, name: string) {
    return new Promise<boolean>((resolve) => {
      this.fileInfo(bucket, name).then(() => resolve(true)).catch(() => resolve(false));
    });
  }

  public async deleteAllContent(bucket: string) {
    const files = (await this.getFiles(bucket)).map((obj) => ({ Key: obj.Key })) as ObjectIdentifierList;
    return this.deleteFiles(bucket, files);
  }

  public uploadFile(
      bucket: string,
      file: string,
      folderName?: string,
      options?: UploadOptionsBasic) {
    return new Promise<SendData>(async (resolve, reject) => {
      const name = path.basename(file);
      const destination = [folderName, name].filter(Boolean).join('/');
      const mimeType = mime.contentType(name) || undefined;
      let expire: Date | undefined;
      if (options) {
        if (options.expireDate) {
          expire = options.expireDate;
        } else if (options.expire) {
          const [, value, unit] = /(\d+)(\w+)/.exec(options.expire) || [];
          if (value !== undefined && unit) {
            expire = dayjs().add(+value, unit as OpUnitType).toDate();
          }
        }
        if (options.create && this.s3Buckets) {
          const exist = await this.s3Buckets.bucketExist(bucket);
          if (!exist) {
            await this.s3Buckets.createBucket(bucket);
          }
        }
        if (!options.replace) {
          const exist = await this.fileExist(bucket, destination);
          if (exist) {
            throw new Error(`${Config.TAG} File "${destination}" already exists in bucket "${bucket}" and will not be replaced`);
          }
        }
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
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  public async uploadFiles(
      bucket: string,
      files: string | string[],
      folderName?: string,
      options: UploadOptions = {}
  ) {
    const { compress, replace, create, expire, expireDate } = options;
    if (!Array.isArray(files)) {
      files = [files];
    }
    let uploadFiles = files;
    if (compress) {
      let zipName = compress;
      if (typeof zipName !== 'string') {
        zipName = `zipped_${dayjs().format('YYYY-MM-DD.HHmmss')}.zip`;
      }
      const result = await this.compressFiles(files, zipName);
      uploadFiles = [result];
    }
    const result: { [filename: string]: SendData } = {};
    for (const file of uploadFiles) {
      if (file.includes('*')) {
        await this.uploadFiles(bucket, glob.sync(file), folderName, options);
      } else if (fs.lstatSync(file).isDirectory()) {
        await this.uploadFiles(bucket, glob.sync(`${file}/*`), folderName, options);
      } else {
        const filename = path.basename(file);
        result[filename] = await this.uploadFile(bucket, file, folderName, { replace, create, expireDate, expire });
      }
    }
    return result;
  }

  public async cleanOlder(bucket: string, timeSpace: string, folderName?: string) {
    const [, value, unit] = /(\d+)(\w+)/.exec(timeSpace) || [];
    if (value === undefined || !unit) {
      throw new Error(`${Config.TAG} Unknown time definition`);
    }
    const limit = dayjs().subtract(+value, unit as OpUnitType);
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
          `${Config.TAG} Error in mysql-dump environment variables not defined: $MYSQL_USER, $MYSQL_PASSWORD, $MYSQL_DATABASE, $MYSQL_HOST, $MYSQL_PORT`);
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
      FileUtils.mkdirp(path.dirname(fileDest));
      const content = Object.values(dump)
          .map((result) => result && result.replace(/^# /gm, '-- '))
          .join('\n\n');
      fs.writeFileSync(fileDest, content);
      return fileDest;
    });
  }

  private deleteFiles(bucket: string, files: ObjectIdentifierList) {
    return new Promise<DeleteObjectOutput>(async (resolve, reject) => {
      const filesToDelete: Delete = { Objects: files.filter((f) => !!f.Key) };
      this.s3Sdk.deleteObjects({ Bucket: bucket, Delete: filesToDelete }, (error, data) => {
        if (error) {
          reject(error);
        } else {
          const { Deleted } = data;
          if (Deleted && Deleted.length) {
            Deleted.forEach((f) => {
              console.warn(`${Config.TAG} Deleted file: ${f.Key}`);
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
      FileUtils.mkdirp(path.dirname(fileDest));
      const output = fs.createWriteStream(fileDest);
      const readStreams: ReadStream[] = [];
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });
      output.on('close', () => {
        resolve(fileDest);
        output.destroy();
      });

      output.on('end', () => {
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
