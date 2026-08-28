import { parseConfigFlags } from '@myadmin/config';
import { runServeCommand } from './commands/serve';
import { runVersionCommand } from './commands/version';
import { consoleTerminalPresenter } from './output/terminal-presenter';

export interface CliFlags {
  host?: string;
  port?: number;
  dataDirectory?: string;
  status?: boolean;
}

export class CliArgumentError extends Error {}

export function parseCliFlags(args: string[]): { command: string; flags: CliFlags } {
  const command = args[0] ?? 'help';
  let configFlags: ReturnType<typeof parseConfigFlags>;
  try {
    configFlags = parseConfigFlags(args.slice(1));
  } catch (error) {
    throw new CliArgumentError(
      error instanceof Error ? error.message : 'Invalid configuration flag',
    );
  }
  return {
    command,
    flags: {
      host: configFlags.server?.host,
      port: configFlags.server?.port,
      dataDirectory: configFlags.dataDir,
    },
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
      case 'migrate':
        {
          const { runMigrateCommand } = await import('./commands/migrate');
          await runMigrateCommand({ ...flags, presenter: consoleTerminalPresenter });
        }
        return;
      case 'help':
        console.log(
          'Usage: myadmin <serve|migrate|version> [--host HOST] [--port PORT] [--data-dir PATH] [--status]',
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
