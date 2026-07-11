/**
 * Retries an operation once on Mongo's duplicate-key error (E11000). Two
 * concurrent upserts against the same unique key can BOTH take the insert
 * path — Mongo then rejects the loser instead of turning it into an update.
 * On retry the document exists, so the update path wins and no write is lost.
 */
export async function retryOnDupKey<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      return op();
    }
    throw err;
  }
}
