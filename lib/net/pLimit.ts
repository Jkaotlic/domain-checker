/**
 * Minimal concurrency limiter (replaces `p-limit` to avoid ESM/bundler issues).
 */
export default function pLimit(concurrency: number) {
  if (!Number.isInteger(concurrency) && concurrency !== Infinity) {
    throw new TypeError('Expected `concurrency` to be a number');
  }
  if (concurrency < 1) {
    throw new TypeError('Expected `concurrency` to be >= 1');
  }

  const queue: Array<() => void> = [];
  let active = 0;

  function next() {
    active--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  }

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(next);
      };

      if (active < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}
