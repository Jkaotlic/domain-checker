import pLimit from './pLimit';
import logger from '../logger';

export async function runTasksWithRetry<T>(
  tasks: Array<() => Promise<T>>,
  opts?: { concurrency?: number; retries?: number; backoffMs?: number }
): Promise<(T | Error)[]> {
  const concurrency = opts?.concurrency ?? 10;
  const retries = opts?.retries ?? 3;
  const backoffBase = opts?.backoffMs ?? 200;

  const limit = pLimit(concurrency);

  async function execWithRetry(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (attempt > retries) {
          throw err as Error;
        }
        const delay = backoffBase * Math.pow(2, attempt - 1);
        logger.debug({ attempt, delay }, 'worker retrying task after error');
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  const ps = tasks.map((t) => limit(() =>
    execWithRetry(t).catch((e) => e instanceof Error ? e : new Error(String(e)))
  ));
  return Promise.all(ps);
}

export default runTasksWithRetry;
