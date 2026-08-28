export type ShutdownReason = 'SIGINT' | 'SIGTERM';

export interface SignalHandlerOptions {
  shutdown: (reason: ShutdownReason) => Promise<void> | void;
  forceExit?: (code: number) => void;
  setExitCode?: (code: number) => void;
}

export function installSignalHandlers(options: SignalHandlerOptions): () => void {
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | undefined;
  const setExitCode =
    options.setExitCode ??
    ((code: number) => {
      process.exitCode = code;
    });
  const forceExit = options.forceExit ?? ((code: number) => process.exit(code));

  const handleSignal = (signal: ShutdownReason): void => {
    if (shuttingDown) {
      forceExit(1);
      return;
    }

    shuttingDown = true;
    setExitCode(0);
    shutdownPromise = Promise.resolve(options.shutdown(signal)).catch(() => {
      setExitCode(1);
    });
    void shutdownPromise;
  };

  const onSigint = (): void => handleSignal('SIGINT');
  const onSigterm = (): void => handleSignal('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  return () => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };
}
