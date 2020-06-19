import { cliOptions } from './cliconfig';
import { S3Wrapper } from '../src';
import { Config } from '../src/config';
import colors from 'colors';
import { S3 } from 'aws-sdk';

const theme = {
  folder: 'cyan',
  error: 'red'
};

colors.setTheme(theme);

export class Cli {
  private s3Wrapper: S3Wrapper;

  constructor(private opts = cliOptions) {
    const { endpoint, bucket } = opts;
    this.s3Wrapper = new S3Wrapper({ endpoint, bucket });
  }

  async parseOptions() {
    for (const command in this.opts) {
      if (Object.prototype.hasOwnProperty.call(this.opts, command)) {
        const args = this.opts[command] as string | string[];
        const zip = this.opts['zip'];
        const folder = this.opts['folder'];
        const replace = this.opts['replace'];
        const create = this.opts['create'];
        switch (command) {
          case 'backup':
            await this.backup(args, { zip, folder, replace, create });
            break;
          case 'delete':
            await this.delete(args, folder);
            break;
          case 'mysql':
            await this.dumpMysql({ zip, folder, replace, create });
            break;
          case 'list':
            await this.showList();
            break;
        }
      }
    }
  }

  async showList() {
    const files = await this.s3Wrapper.getFiles();
    if (files.length) {
      console.info(`${Config.TAG} File list in bucket "${this.s3Wrapper.bucket}": ${files.length}`);
      this.beautifulFiles(files);
    } else {
      console.info(`${Config.TAG} No files found in bucket "${this.s3Wrapper.bucket}"`);
    }
  }

  async delete(args: string | string[], folderName?: string) {
    if (!Array.isArray(args)) {
      args = [args];
    }
    const parsed = args
      .map((arg) => this.parseDelete(arg))
      .map((arg) => {
        if (!arg.folder) {
          arg.folder = folderName || null;
        }
        return {
          ...arg
        };
      });
    try {
      for (const info of parsed) {
        const { folder, timeSpace } = info;
        await this.s3Wrapper.cleanOlder(timeSpace, folder || undefined);
      }
    } catch (_e) {
      console.error(`${Config.TAG} Error in delete files`);
    }
  }

  async backup(files: string | string[], options: { zip?: string; folder?: string; replace?: boolean; create?: boolean }) {
    const { zip, folder, replace, create } = options;
    if (!Array.isArray(files)) {
      files = [files];
    }
    await this.s3Wrapper.uploadFiles(files, folder || undefined, {
      compress: zip || zip === null,
      replace,
      create
    });
  }

  async dumpMysql(options: { zip?: string; folder?: string; replace?: boolean; create?: boolean }) {
    let mysqlfile = '';
    try {
      mysqlfile = await this.s3Wrapper.createDumpFile();
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions,@typescript-eslint/no-unsafe-call
      console.error(colors.bold[theme.error](`${Config.TAG} Error mysql ${err}`));
      process.exit(-1);
    }
    await this.backup(mysqlfile, options);
  }

  private parseDelete(arg: string) {
    let folder;
    let timeSpace;
    const parsed = arg.split('=');
    if (parsed.length > 1) {
      folder = parsed[0];
      timeSpace = parsed[1];
    } else {
      timeSpace = arg;
      folder = null;
    }
    return {
      folder,
      timeSpace
    };
  }

  private beautifulFiles(files: S3.ObjectList) {
    const parsed = files.map((file) => file.Key);
    parsed.sort();
    parsed.forEach((file) => {
      console.info(file);
    });
  }
}
