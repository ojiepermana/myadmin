import { runRuntime } from '../bootstrap/runtime-lifecycle';
import type { TerminalPresenter } from '../output/terminal-presenter';

export interface ServeCommandOptions {
  host?: string;
  port?: number;
  dataDirectory?: string;
  env?: Record<string, string | undefined>;
  presenter: TerminalPresenter;
}

export async function runServeCommand(options: ServeCommandOptions): Promise<void> {
  const runtime = await runRuntime({
    host: options.host,
    port: options.port,
    dataDirectory: options.dataDirectory,
    env: options.env,
    presenter: options.presenter,
  });
  await runtime.waitForShutdown();
}
