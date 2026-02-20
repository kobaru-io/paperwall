import * as readline from 'node:readline';

/**
 * Prompts the user for a password securely without echoing to stdout.
 * Falls back to normal prompt if stdin/stdout are not a TTY or if
 * stdout cannot be reliably muted.
 */
export async function promptPassword(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const originalWrite = process.stdout.write.bind(process.stdout);
  let isMuted = false;

  (process.stdout as any).write = function (chunk: any, encoding: any, cb: any) {
    if (!isMuted) return originalWrite(chunk, encoding, cb);
    return true;
  };

  process.stdout.write(query);
  isMuted = true;

  return new Promise((resolve) => {
    rl.question('', (answer) => {
      isMuted = false;
      (process.stdout as any).write = originalWrite;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}
