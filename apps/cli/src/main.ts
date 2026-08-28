import { runServeCommand } from './commands/serve';
import { runVersionCommand } from './commands/version';
import { consoleTerminalPresenter } from './output/terminal-presenter';

export interface CliFlags {
  host?: string;
  port?: number;
  dataDirectory?: string;
}

export class CliArgumentError extends Error {}

export function parseCliFlags(args: string[]): { command: string; flags: CliFlags } {
  const command = args[0] ?? 'help';
  const flags: CliFlags = {};
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index] ?? '';
    const [inlineName, inlineValue] = argument.split('=', 2);
    const name = inlineName;
    const next = () => {
      const value = inlineValue ?? args[++index];
      if (!value) throw new CliArgumentError(`${name} requires a value`);
      return value;
    };
    switch (name) {
      case '--host':
        flags.host = next();
        break;
      case '--port': {
        const value = Number(next());
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
          throw new CliArgumentError('--port must be an integer from 1 to 65535');
        }
        flags.port = value;
        break;
      }
      case '--data-dir':
        flags.dataDirectory = next();
        break;
      default:
        throw new CliArgumentError(`Unknown option: ${argument}`);
    }
  }
  return { command, flags };
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const { command, flags } = parseCliFlags(args);
    switch (command) {
      case 'version':
        runVersionCommand(consoleTerminalPresenter);
        return;
      case 'serve':
        await runServeCommand({ ...flags, presenter: consoleTerminalPresenter });
        return;
      case 'help':
        console.log('Usage: myadmin <serve|version> [--host HOST] [--port PORT] [--data-dir PATH]');
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
