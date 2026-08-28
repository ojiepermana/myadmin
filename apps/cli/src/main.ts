import packageManifest from '../../../package.json' with { type: 'json' };

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  const [command = 'help'] = args;

  switch (command) {
    case 'version':
      console.log(packageManifest.version);
      return;
    case 'serve': {
      const { startServer } = await import('../../../apps/server/src/app');
      await startServer();
      return;
    }
    case 'help':
      console.log('Usage: myadmin <serve|version>');
      return;
    default:
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCli();
}
