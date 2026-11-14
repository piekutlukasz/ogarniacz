import { describe, expect, it } from 'vitest';
import { type Runner, uploadBackups } from './offsite';

function recordingRunner(failOn?: string) {
  const calls: string[][] = [];
  const run: Runner = async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === failOn) throw new Error(`${failOn} nie powiódł się`);
  };
  return { calls, run };
}

describe('kopia poza serwerem', () => {
  it('wysyła kopie i usuwa tam starsze niż limit', async () => {
    const { calls, run } = recordingRunner();

    await uploadBackups('/data/backups', { remote: 'ogarniacz-backup:', keepDays: 60, run });

    expect(calls).toEqual([
      ['rclone', 'copy', '/data/backups', 'ogarniacz-backup:', '--include', 'ogarniacz-*.db'],
      ['rclone', 'delete', 'ogarniacz-backup:', '--include', 'ogarniacz-*.db', '--min-age', '60d'],
    ]);
  });

  it('nie usuwa starych kopii, gdy wysyłka się nie udała', async () => {
    const { calls, run } = recordingRunner('copy');

    await expect(uploadBackups('/data/backups', { remote: 'x:', keepDays: 60, run })).rejects.toThrow('copy');
    expect(calls).toHaveLength(1);
  });

  it('używa wskazanej ścieżki do rclone', async () => {
    const { calls, run } = recordingRunner();

    await uploadBackups('/b', { remote: 'x:', keepDays: 1, rclone: '/opt/rclone/rclone', run });

    expect(calls.every(([command]) => command === '/opt/rclone/rclone')).toBe(true);
  });
});
