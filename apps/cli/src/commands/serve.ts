import { runRuntime } from '../bootstrap/runtime-lifecycle';
import type { TerminalPresenter } from '../output/terminal-presenter';

export interface ServeCommandOptions {
  argv?: readonly string[];
  host?: string;
  port?: number;
  dataDirectory?: string;
  env?: Record<string, string | undefined>;
  presenter: TerminalPresenter;
}

export async function runServeCommand(options: ServeCommandOptions): Promise<void> {
  const runtime = await runRuntime({
    argv: options.argv,
    host: options.host,
    port: options.port,
    dataDirectory: options.dataDirectory,
    env: options.env,
    presenter: options.presenter,
  });
  await runtime.waitForShutdown();
}
