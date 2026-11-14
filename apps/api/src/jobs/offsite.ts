import { execFile } from 'node:child_process';

/** Uruchamia program bez powłoki, więc ścieżki i nazwy zdalne nie są interpretowane jako polecenia. */
export type Runner = (command: string, args: string[]) => Promise<void>;

export const execRunner: Runner = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 15 * 60 * 1000 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} ${args[0] ?? ''} nie powiódł się: ${stderr.trim() || error.message}`));
      } else {
        resolve();
      }
    });
  });

export type OffsiteOptions = {
  /** Cel rclone, np. `ogarniacz-backup:` (zaszyfrowany katalog na Google Drive). */
  remote: string;
  keepDays: number;
  rclone?: string;
  run?: Runner;
};

const BACKUP_PATTERN = 'ogarniacz-*.db';

/**
 * Wysyła lokalne kopie poza serwer i usuwa tam kopie starsze niż `keepDays`.
 * Wysyła cały katalog, więc kopia, której nie udało się wysłać wczoraj, trafi tam dziś.
 */
export async function uploadBackups(dir: string, { remote, keepDays, rclone = 'rclone', run = execRunner }: OffsiteOptions) {
  await run(rclone, ['copy', dir, remote, '--include', BACKUP_PATTERN]);
  await run(rclone, ['delete', remote, '--include', BACKUP_PATTERN, '--min-age', `${keepDays}d`]);
}
