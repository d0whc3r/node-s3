import type { ObjectCannedACL, ServerSideEncryption, StorageClass } from '@aws-sdk/client-s3';
import commandLineArgs from 'command-line-args';
import commandLineUsage, { OptionDefinition, Section } from 'command-line-usage';

export const optionDefinitions: OptionDefinition[] = [
  {
    name: 'endpoint',
    alias: 'e',
    typeLabel: '{underline url}',
    multiple: false,
    type: String,
    description: 'Destination URL (or $AWS_ENDPOINT_URL / $ENDPOINT env variable)'
  },
  {
    name: 'bucket',
    typeLabel: '{underline bucket}',
    multiple: false,
    type: String,
    description: 'Destination bucket (or $BUCKET env variable)'
  },
  {
    name: 'region',
    typeLabel: '{underline region}',
    multiple: false,
    type: String,
    description: 'AWS/S3 region (or $AWS_REGION env variable, default: us-east-1)'
  },
  {
    name: 'list',
    alias: 'l',
    multiple: false,
    type: Boolean,
    description: 'List all files (optionally filtered by --folder)'
  },
  {
    name: 'backup',
    alias: 'b',
    typeLabel: '{underline file*}',
    defaultOption: true,
    multiple: true,
    type: String,
    description: 'Backup files, directories, or globs'
  },
  {
    name: 'download',
    typeLabel: '{underline key}',
    multiple: false,
    type: String,
    description: 'Download an object by S3 key'
  },
  {
    name: 'output',
    alias: 'o',
    typeLabel: '{underline path}',
    multiple: false,
    type: String,
    description: 'Local destination path for --download'
  },
  {
    name: 'zip',
    alias: 'z',
    typeLabel: '{underline zipname.zip}',
    multiple: false,
    type: String,
    description: 'Zip backup files before uploading'
  },
  {
    name: 'replace',
    alias: 'r',
    multiple: false,
    type: Boolean,
    description: 'Replace files if they already exist on upload'
  },
  {
    name: 'create',
    alias: 'c',
    multiple: false,
    type: Boolean,
    description: 'Create destination bucket if it does not exist'
  },
  {
    name: 'folder',
    alias: 'f',
    typeLabel: '{underline foldername}',
    multiple: false,
    type: String,
    description: 'Folder prefix in the bucket'
  },
  {
    name: 'delete',
    alias: 'd',
    typeLabel: '{underline foldername=duration} OR {underline duration}',
    multiple: true,
    type: String,
    description: 'Clean files older than duration (e.g. 7d, 24h, 1M) in foldername'
  },
  {
    name: 'keep-last',
    typeLabel: '{underline N}',
    multiple: false,
    type: Number,
    description: 'Keep the newest N files when running --delete'
  },
  {
    name: 'mysql',
    alias: 'm',
    multiple: false,
    type: Boolean,
    description: 'MySQL backup using environment variables ($MYSQL_USER, $MYSQL_PASSWORD, $MYSQL_DATABASE, $MYSQL_HOST, $MYSQL_PORT)'
  },
  {
    name: 'stdin',
    multiple: false,
    type: Boolean,
    description: 'Read upload content from stdin (requires --name)'
  },
  {
    name: 'name',
    typeLabel: '{underline filename}',
    multiple: false,
    type: String,
    description: 'Destination filename when using --stdin'
  },
  {
    name: 'encrypt',
    multiple: false,
    type: Boolean,
    description: 'Encrypt uploads / decrypt downloads with AES-256-GCM using $BACKUP_ENCRYPTION_KEY'
  },
  {
    name: 'storage-class',
    typeLabel: '{underline class}',
    multiple: false,
    type: String,
    description: 'S3 storage class (e.g. STANDARD, STANDARD_IA, GLACIER, DEEP_ARCHIVE)'
  },
  {
    name: 'sse',
    typeLabel: '{underline algorithm}',
    multiple: false,
    type: String,
    description: 'Server-side encryption algorithm (e.g. AES256, aws:kms)'
  },
  {
    name: 'kms-key-id',
    typeLabel: '{underline id}',
    multiple: false,
    type: String,
    description: 'KMS key ID for aws:kms server-side encryption'
  },
  {
    name: 'acl',
    typeLabel: '{underline acl}',
    multiple: false,
    type: String,
    description: 'Canned ACL (e.g. private, public-read)'
  },
  {
    name: 'expire',
    typeLabel: '{underline duration}',
    multiple: false,
    type: String,
    description: 'Object expiration duration (e.g. 7d, 1M)'
  },
  {
    name: 'exclude',
    typeLabel: '{underline glob}',
    multiple: true,
    type: String,
    description: 'Exclude glob pattern(s) during backup (repeatable)'
  },
  {
    name: 'dry-run',
    multiple: false,
    type: Boolean,
    description: 'Preview upload/delete operations without modifying S3'
  },
  {
    name: 'json',
    multiple: false,
    type: Boolean,
    description: 'Output machine-readable JSON'
  },
  {
    name: 'quiet',
    alias: 'q',
    multiple: false,
    type: Boolean,
    description: 'Suppress informational logs'
  },
  {
    name: 'version',
    alias: 'v',
    multiple: false,
    type: Boolean,
    description: 'Print CLI version'
  },
  {
    name: 'help',
    alias: 'h',
    description: 'Print this usage guide',
    type: Boolean
  }
];

export interface S3Options {
  help?: boolean;
  version?: boolean;
  endpoint?: string;
  bucket?: string;
  region?: string;
  list?: boolean;
  backup?: string[];
  download?: string;
  output?: string;
  folder?: string;
  zip?: string | null;
  create?: boolean;
  replace?: boolean;
  delete?: string[];
  keepLast?: number;
  mysql?: boolean;
  stdin?: boolean;
  name?: string;
  encrypt?: boolean;
  storageClass?: StorageClass;
  sse?: ServerSideEncryption;
  kmsKeyId?: string;
  acl?: ObjectCannedACL;
  expire?: string;
  exclude?: string[];
  dryRun?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export function parseCliArgs(argv?: string[]): S3Options {
  const raw = commandLineArgs(optionDefinitions, argv !== undefined ? { argv } : undefined);
  const options: S3Options = {};

  if (raw.help !== undefined) options.help = Boolean(raw.help);
  if (raw.version !== undefined) options.version = Boolean(raw.version);
  if (raw.endpoint !== undefined) options.endpoint = String(raw.endpoint);
  if (raw.bucket !== undefined) options.bucket = String(raw.bucket);
  if (raw.region !== undefined) options.region = String(raw.region);
  if (raw.list !== undefined) options.list = Boolean(raw.list);
  if (raw.backup !== undefined) options.backup = Array.isArray(raw.backup) ? raw.backup : [String(raw.backup)];
  if (raw.download !== undefined) options.download = String(raw.download);
  if (raw.output !== undefined) options.output = String(raw.output);
  if (raw.folder !== undefined) options.folder = String(raw.folder);
  if ('zip' in raw) options.zip = raw.zip === null ? null : String(raw.zip);
  if (raw.create !== undefined) options.create = Boolean(raw.create);
  if (raw.replace !== undefined) options.replace = Boolean(raw.replace);
  if (raw.delete !== undefined) options.delete = Array.isArray(raw.delete) ? raw.delete : [String(raw.delete)];
  if (raw['keep-last'] !== undefined) options.keepLast = Number(raw['keep-last']);
  if (raw.mysql !== undefined) options.mysql = Boolean(raw.mysql);
  if (raw.stdin !== undefined) options.stdin = Boolean(raw.stdin);
  if (raw.name !== undefined) options.name = String(raw.name);
  if (raw.encrypt !== undefined) options.encrypt = Boolean(raw.encrypt);
  if (raw['storage-class'] !== undefined) options.storageClass = String(raw['storage-class']) as StorageClass;
  if (raw.sse !== undefined) options.sse = String(raw.sse) as ServerSideEncryption;
  if (raw['kms-key-id'] !== undefined) options.kmsKeyId = String(raw['kms-key-id']);
  if (raw.acl !== undefined) options.acl = String(raw.acl) as ObjectCannedACL;
  if (raw.expire !== undefined) options.expire = String(raw.expire);
  if (raw.exclude !== undefined) options.exclude = Array.isArray(raw.exclude) ? raw.exclude : [String(raw.exclude)];
  if (raw['dry-run'] !== undefined) options.dryRun = Boolean(raw['dry-run']);
  if (raw.json !== undefined) options.json = Boolean(raw.json);
  if (raw.quiet !== undefined) options.quiet = Boolean(raw.quiet);

  return options;
}

export function getUsageGuide(): string {
  const ex = 'node-s3';
  const baseExec = `${ex} -e https://s3.eu-central-1.amazonaws.com --bucket sample`;
  const sections: Section[] = [
    {
      header: `Help for ${ex}`,
      content: `Usage of {italic ${ex}} in command line.`
    },
    {
      header: 'Options',
      optionList: optionDefinitions
    },
    {
      header: 'Examples',
      content: [
        {
          desc: '1. List files in "sample" bucket.',
          example: `$ ${baseExec} -l`
        },
        {
          desc: '2. Backup multiple files to "backupFolder" folder.',
          example: `$ ${baseExec} -b src/index.ts -b images/logo.png -f backupFolder`
        },
        {
          desc: '3. Backup files using wildcard and exclude patterns.',
          example: `$ ${baseExec} -b "src/*" --exclude "*.test.ts" -f backup`
        },
        {
          desc: '4. Backup and zip with AES-256-GCM encryption.',
          example: `$ BACKUP_ENCRYPTION_KEY=secret ${baseExec} -b "src/*" -z allfiles.zip -f zipped --encrypt -c -r`
        },
        {
          desc: '5. Download and decrypt a backup.',
          example: `$ BACKUP_ENCRYPTION_KEY=secret ${baseExec} --download zipped/allfiles.zip -o ./restore.zip --encrypt`
        },
        {
          desc: '6. Delete files older than 7 days while keeping the 3 newest.',
          example: `$ ${baseExec} -d uploads=7d --keep-last 3`
        },
        {
          desc: '7. Stream stdin directly to S3.',
          example: `$ pg_dump mydb | ${baseExec} --stdin --name mydb.sql -f db-backups`
        },
        {
          desc: '8. Generate MySQL dump, zip it and upload to "mysql-backup" folder.',
          example: `$ ${baseExec} -f mysql-backup -m -z`
        }
      ]
    }
  ];
  return commandLineUsage(sections);
}
