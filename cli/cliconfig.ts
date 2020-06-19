import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage, { OptionDefinition, Section } from 'command-line-usage';

const optionDefinitions: OptionDefinition[] = [
  {
    name: 'endpoint',
    alias: 'e',
    typeLabel: '{underline url} ',
    multiple: false,
    type: String,
    description: 'Destination url (can be defined by $ENDPOINT env variable)'
  },
  {
    name: 'bucket',
    typeLabel: '{underline bucket} ',
    multiple: false,
    type: String,
    description: 'Destination bucket (can be defined by $BUCKET env variable)'
  },
  {
    name: 'list',
    alias: 'l',
    multiple: false,
    type: Boolean,
    description: 'List all files'
  },
  {
    name: 'backup',
    alias: 'b',
    typeLabel: '{underline file*} ',
    defaultOption: true,
    multiple: true,
    type: String,
    description: 'Backup files'
  },
  {
    name: 'zip',
    alias: 'z',
    typeLabel: '{underline zipname.zip}',
    multiple: false,
    type: String,
    description: 'Zip backup files'
  },
  {
    name: 'replace',
    alias: 'r',
    multiple: false,
    type: Boolean,
    description: 'Replace files if already exists when backup upload'
  },
  {
    name: 'create',
    alias: 'c',
    multiple: false,
    type: Boolean,
    description: 'Create destination upload bucket'
  },
  {
    name: 'folder',
    alias: 'f',
    typeLabel: '{underline foldername}',
    multiple: false,
    type: String,
    description: 'Folder name to upload file/s'
  },
  {
    name: 'delete',
    alias: 'd',
    typeLabel: '{underline foldername=duration} OR {underline duration}',
    multiple: true,
    type: String,
    description: 'Clean files older than duration in foldername'
  },
  {
    name: 'mysql',
    alias: 'm',
    multiple: false,
    type: Boolean,
    description:
      'Mysql backup using environment variables to connect mysql server ($MYSQL_USER, $MYSQL_PASSWORD, $MYSQL_DATABASE, $MYSQL_HOST, $MYSQL_PORT)'
  },
  {
    name: 'help',
    alias: 'h',
    description: 'Print this usage guide.',
    type: Boolean
  }
];

export interface S3Options extends CommandLineOptions {
  help?: boolean;
  endpoint?: string;
  bucket?: string;
  list?: boolean;
  backup?: string | string[];
  folder?: string;
  zip?: string;
  create?: boolean;
  replace?: boolean;
  delete?: string;
  mysql?: boolean;
}

let cliOptions: S3Options = {};
try {
  cliOptions = commandLineArgs(optionDefinitions);
} catch (e) {
  console.error('[-] Error:', (e as Error)['message']);
  process.exit(1);
}

if (cliOptions.help || !Object.keys(cliOptions).length) {
  const ex = 'node-s3';
  const baseExec = `${ex} -e http://s3.eu-central-1.amazonaws.com --bucket sample`;
  const sections: Section[] = [
    {
      header: `Help for ${ex}`,
      content: `Usage of npm {italic ${ex}} in command line.`
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
          desc: '3. Backup files using wildcard to "backup" folder.',
          example: `$ ${baseExec} -b src/* -b images/* -f backup`
        },
        {
          desc: '4. Backup files using wildcard and zip into "zipped" folder, bucket will be created if it doesn\'t exists.',
          example: `$ ${baseExec} -b src/* -b images/* -z -f zipped.zip -c`
        },
        {
          desc:
            '5. Backup files using wildcard and zip using "allfiles.zip" as filename into "zipped" folder, bucket will be created if it doesn\'t exists and zipfile will be replaced if it exists',
          example: `$ ${baseExec} -b src/* -b images/* -z allfiles.zip -f zipped -c -r`
        },
        {
          desc: '6. Delete files in "uploads" folder older than 2days and files in "monthly" folder older than 1month',
          example: `$ ${baseExec} -d uploads=2d -d monthly=1M`
        },
        {
          desc: '7. Delete files in "uploads" folder older than 1minute',
          example: `$ ${baseExec} -f uploads -d 1m`
        },
        {
          desc: '8. Generate mysql dump file zip it and upload to "mysql-backup" folder',
          example: `$ ${baseExec} -f mysql-backup -m -z`
        }
      ]
    }
  ];
  console.info(commandLineUsage(sections));
  process.exit(0);
}

export { cliOptions };
