export interface TerminalPresenter {
  info(message: string): void;
  error(message: string): void;
}

export const consoleTerminalPresenter: TerminalPresenter = {
  info: (message) => console.log(message),
  error: (message) => console.error(message),
};

export function presentServing(
  presenter: TerminalPresenter,
  host: string,
  port: number,
  dataDirectory: string,
): void {
  presenter.info(`MyAdmin serving at http://${host}:${port}`);
  presenter.info(`Data directory: ${dataDirectory}`);
  presenter.info('Press Ctrl+C to stop.');
}

export function presentBootstrapFailure(
  presenter: TerminalPresenter,
  stage: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : 'unknown error';
  presenter.error(`MyAdmin boot failed during ${stage}: ${message}`);
}
