import { KvModel, type KvDoc } from '../models.js';
import { retryOnDupKey } from '../retry.js';

/** Tiny process-shared key-value store (e.g. last-deployed command-set hash). */
export async function getKv(key: string): Promise<string | null> {
  const doc = (await KvModel.findOne({ key }).lean()) as KvDoc | null;
  return doc?.value ?? null;
}

export async function setKv(key: string, value: string): Promise<void> {
  await retryOnDupKey(() => KvModel.updateOne({ key }, { $set: { value } }, { upsert: true }));
}
