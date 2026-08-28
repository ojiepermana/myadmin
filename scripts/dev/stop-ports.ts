export {};

const ports = [
  Number(process.env['MYADMIN_PORT'] || 8080),
  Number(process.env['MYADMIN_WEB_PORT'] || 4200),
];

for (const port of ports) {
  const result = await new Response(
    Bun.spawn(['lsof', '-tiTCP:' + port, '-sTCP:LISTEN'], {
      stdout: 'pipe',
      stderr: 'ignore',
    }).stdout,
  ).text();

  for (const pidText of result.trim().split(/\s+/).filter(Boolean)) {
    const pid = Number(pidText);
    if (Number.isInteger(pid) && pid > 0) {
      process.kill(pid, 'SIGTERM');
      console.log(`Stopped process ${pid} on port ${port}`);
    }
  }
}
