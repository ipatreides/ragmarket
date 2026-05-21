// Run `tasks` with at most `concurrency` in flight. Resolves when
// every task has settled. Each task is responsible for its own error
// handling — exceptions are swallowed so one bad task doesn't stop
// the rest of the pool.
export async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<void> {
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(concurrency, tasks.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = cursor++;
          if (i >= tasks.length) return;
          try {
            await tasks[i]();
          } catch {
            // task is responsible for storing its own error state
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
}
