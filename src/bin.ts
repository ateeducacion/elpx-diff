import { main } from './cli.js';

/** Process entry point: wires the real streams, environment and exit status. */
process.exitCode = await main(process.argv.slice(2), {
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
  env: process.env,
  color: process.stdout.isTTY === true && !process.env['NO_COLOR'],
});
