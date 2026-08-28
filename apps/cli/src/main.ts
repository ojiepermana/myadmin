import { parseConfigFlags } from '@myadmin/config';
import { runDoctorCommand } from './commands/doctor';
import { runServeCommand } from './commands/serve';
import { runVersionCommand } from './commands/version';
import { consoleTerminalPresenter } from './output/terminal-presenter';

export interface CliFlags {
  host?: string;
  port?: number;
  dataDirectory?: string;
  status?: boolean;
  json?: boolean;
}

export class CliArgumentError extends Error {}

export function parseCliFlags(args: string[]): { command: string; flags: CliFlags } {
  const command = args[0] ?? 'help';
  const commandArgs = args.slice(1);
  const status = command === 'migrate' && commandArgs.includes('--status');
  const json = command === 'doctor' && commandArgs.includes('--json');
  const configArgs = commandArgs.filter(
    (argument) =>
      !(command === 'migrate' && argument === '--status') &&
      !(command === 'doctor' && argument === '--json'),
  );
  let configFlags: ReturnType<typeof parseConfigFlags>;
  try {
    configFlags = parseConfigFlags(configArgs);
  } catch (error) {
    throw new CliArgumentError(
      error instanceof Error ? error.message : 'Invalid configuration flag',
    );
  }
  const flags: CliFlags = {
    host: configFlags.server?.host,
    port: configFlags.server?.port,
    dataDirectory: configFlags.dataDir,
  };
  if (status) flags.status = true;
  if (json) flags.json = true;
  return {
    command,
    flags,
  };
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const { command, flags } = parseCliFlags(args);
    switch (command) {
      case 'version':
        runVersionCommand(consoleTerminalPresenter);
        return;
      case 'serve':
        await runServeCommand({
          ...flags,
          argv: args.slice(1),
          presenter: consoleTerminalPresenter,
        });
        return;
      case 'doctor':
        {
          const result = await runDoctorCommand({
            dataDirectory: flags.dataDirectory,
            argv: args.slice(1).filter((argument) => argument !== '--json'),
            json: flags.json,
            presenter: consoleTerminalPresenter,
          });
          if (result.exitCode !== 0) process.exitCode = result.exitCode;
        }
        return;
      case 'migrate':
        {
          const { runMigrateCommand } = await import('./commands/migrate');
          await runMigrateCommand({ ...flags, presenter: consoleTerminalPresenter });
        }
        return;
      case 'help':
        console.log(
          'Usage: myadmin <serve|doctor|migrate|version> [--host HOST] [--port PORT] [--data-dir PATH] [--status] [--json]',
        );
        return;
      default:
        throw new CliArgumentError(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Command failed');
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCli();
}
