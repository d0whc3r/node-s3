import pkg from '../package.json' with { type: 'json' };
import { getUsageGuide, parseCliArgs, S3Options } from './cliconfig';
import { Cli } from './climodule';

function hasAction(opts: S3Options): boolean {
  return Boolean(opts.list || opts.backup?.length || opts.delete?.length || opts.mysql || opts.db || opts.dbUrl || opts.download || opts.stdin);
}

async function main(): Promise<void> {
  const opts = parseCliArgs();

  if (opts.version) {
    console.info(pkg.version);
    return;
  }

  if (opts.help || !hasAction(opts)) {
    console.info(getUsageGuide());
    return;
  }

  await new Cli(opts).parseOptions();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[-] Error: ${message}`);
  process.exitCode = 1;
});
