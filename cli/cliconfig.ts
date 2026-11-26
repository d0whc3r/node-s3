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
    name: 'db',
    typeLabel: '{underline engine}',
    multiple: false,
    type: String,
    description: 'Database backup engine: postgres, mysql (or mariadb), mongodb, sqlite'
  },
  {
    name: 'db-url',
    typeLabel: '{underline uri}',
    multiple: false,
    type: String,
    description: 'Database connection URI (auto-detects engine from scheme; overrides $DATABASE_URL)'
  },
  {
    name: 'db-format',
    typeLabel: '{underline format}',
    multiple: false,
    type: String,
    description: 'PostgreSQL dump format: plain (.sql), custom (.dump), or tar (.tar)'
  },
  {
    name: 'mysql',
    alias: 'm',
    multiple: false,
    type: Boolean,
    description: 'Alias for --db mysql (uses $MYSQL_* or $DATABASE_URL)'
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
  db?: string;
  dbUrl?: string;
  dbFormat?: 'plain' | 'custom' | 'tar';
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

const BOOLEAN_OPTION_MAP: ReadonlyArray<readonly [string, keyof S3Options]> = [
  ['help', 'help'],
  ['version', 'version'],
  ['list', 'list'],
  ['create', 'create'],
  ['replace', 'replace'],
  ['mysql', 'mysql'],
  ['stdin', 'stdin'],
  ['encrypt', 'encrypt'],
  ['dry-run', 'dryRun'],
  ['json', 'json'],
  ['quiet', 'quiet']
];

const STRING_OPTION_MAP: ReadonlyArray<readonly [string, keyof S3Options]> = [
  ['endpoint', 'endpoint'],
  ['bucket', 'bucket'],
  ['region', 'region'],
  ['download', 'download'],
  ['output', 'output'],
  ['folder', 'folder'],
  ['name', 'name'],
  ['db', 'db'],
  ['db-url', 'dbUrl'],
  ['db-format', 'dbFormat'],
  ['storage-class', 'storageClass'],
  ['sse', 'sse'],
  ['kms-key-id', 'kmsKeyId'],
  ['acl', 'acl'],
  ['expire', 'expire']
];

const ARRAY_OPTION_MAP: ReadonlyArray<readonly [string, keyof S3Options]> = [
  ['backup', 'backup'],
  ['delete', 'delete'],
  ['exclude', 'exclude']
];

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

export function parseCliArgs(argv?: string[]): S3Options {
  const raw = commandLineArgs(optionDefinitions, argv !== undefined ? { argv } : undefined);
  const options: S3Options = {};
  const target = options as Record<string, unknown>;

  for (const [rawKey, optKey] of BOOLEAN_OPTION_MAP) {
    if (raw[rawKey] !== undefined) {
      target[optKey] = Boolean(raw[rawKey]);
    }
  }
  for (const [rawKey, optKey] of STRING_OPTION_MAP) {
    if (raw[rawKey] !== undefined) {
      target[optKey] = String(raw[rawKey]);
    }
  }
  for (const [rawKey, optKey] of ARRAY_OPTION_MAP) {
    if (raw[rawKey] !== undefined) {
      target[optKey] = toStringArray(raw[rawKey]);
    }
  }

  if ('zip' in raw) {
    options.zip = raw.zip === null ? null : String(raw.zip);
  }
  if (raw['keep-last'] !== undefined) {
    options.keepLast = Number(raw['keep-last']);
  }

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
          desc: '8. Backup PostgreSQL, MySQL, MongoDB, or SQLite natively (streamed directly to S3).',
          example: `$ ${baseExec} --db postgres -f backups/pg --encrypt\n$ ${baseExec} --db-url "mongodb+srv://user:pass@host/mydb" -f backups/mongo\n$ ${baseExec} --db sqlite -f backups/sqlite -z`
        }
      ]
    }
  ];
  return commandLineUsage(sections);
}
