export function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, bigintReplacer));
}

export function outputError(
  error: string,
  message: string,
  exitCode: number,
): void {
  outputJson({ ok: false, error, message });
  process.stderr.write(`[paperwall] Error: ${message}\n`);
  process.exit(exitCode);
}
