import pkg from '../package.json' with { type: 'json' };
import { Config } from '../src/config';
import { getUsageGuide, parseCliArgs, S3Options } from './cliconfig';
import { Cli } from './climodule';
import { selfUpdate } from './updater';

function hasAction(opts: S3Options): boolean {
  return Boolean(
    opts.list || opts.backup?.length || opts.delete?.length || opts.mysql || opts.db || opts.dbUrl || opts.download || opts.stdin || opts.update
  );
}

async function main(): Promise<void> {
  const opts = parseCliArgs();

  if (opts.version) {
    console.info(pkg.version);
    return;
  }

  if (opts.update) {
    const isQuiet = Boolean(opts.quiet || opts.json);
    const result = await selfUpdate({
      repo: 'd0whc3r/node-s3',
      binName: 'node-s3',
      npmPackage: '@d0whc3r/node-s3',
      currentVersion: pkg.version,
      tag: Config.TAG,
      dryRun: opts.dryRun,
      logger: isQuiet ? { info: () => undefined, warn: () => undefined } : console
    });
    if (opts.json) {
      console.info(JSON.stringify(result, null, 2));
    }
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
