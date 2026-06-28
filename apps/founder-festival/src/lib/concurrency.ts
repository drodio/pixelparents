// Run `fn` over `items` with at most `limit` promises in flight at once.
// Resolves when every item has been processed (order of completion is not
// guaranteed). Errors thrown by `fn` reject the whole call — callers that want
// per-item resilience should catch inside `fn`.
export async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx]!, idx);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
}
