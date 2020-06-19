import { Cli } from './climodule';

new Cli().parseOptions().then((r) => r, console.error);
