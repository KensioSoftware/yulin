import { SimCloudFrontKeyValueStoreKeyNotFound } from "../error/sim-cf-key-value-store.error.js";

/**
 * One key and its value, as the key value store data API returns a pair.
 */
export interface SimCloudFrontKeyValuePair {
  readonly Key: string;
  readonly Value: string;
}

/**
 * The keys one simulated CloudFront key value store holds.
 *
 * Kept apart from the store itself because the store is an AWS resource with
 * an identity, a status and an ETag, while this is the map underneath it. The
 * two change for different reasons: a key write touches this, and a rename
 * touches the store.
 *
 * Values are strings. The data API takes and returns strings, and the `json`
 * and `bytes` formats a Function can ask for are parsings of the stored string
 * rather than separate stored types.
 */
export class SimCloudFrontKeyValueStoreKeys {
  private readonly pairs = new Map<string, string>();

  /**
   * Write a key, replacing a value already stored under it.
   */
  put(key: string, value: string): void {
    this.pairs.set(key, value);
  }

  /**
   * Apply a batch of puts and then a batch of deletes.
   *
   * Every write in the data API is this: PutKey is one put, DeleteKey is one
   * delete, and UpdateKeys is both. The deletes land last, so a key in both is
   * deleted, which is what the data API does with a batch naming one twice.
   */
  applyBatch(
    puts: readonly SimCloudFrontKeyValuePair[],
    deletes: readonly { readonly Key: string }[],
  ): void {
    for (const put of puts) {
      this.put(put.Key, put.Value);
    }

    for (const remove of deletes) {
      this.delete(remove.Key);
    }
  }

  /**
   * Forget a key.
   *
   * Deleting a key that is not there is not an error, which is what the data
   * API does: DeleteKey is idempotent.
   */
  delete(key: string): void {
    this.pairs.delete(key);
  }

  /**
   * Read a key, refusing one that is not stored.
   *
   * The data API answers a missing key with ResourceNotFoundException rather
   * than an empty value, and a Function's `get` rejects for the same reason,
   * so there is nothing here that should hand back undefined.
   */
  get(key: string): string {
    const value = this.pairs.get(key);

    if (value === undefined) {
      throw new SimCloudFrontKeyValueStoreKeyNotFound(
        `Sim CloudFront key value store has no key ${key}`,
      );
    }

    return value;
  }

  /**
   * Whether a key is stored.
   */
  has(key: string): boolean {
    return this.pairs.has(key);
  }

  /**
   * Every key and value, in the order they were first written.
   */
  list(): readonly SimCloudFrontKeyValuePair[] {
    return this.pairs
      .entries()
      .map(([key, value]) => ({ Key: key, Value: value }))
      .toArray();
  }

  /**
   * How many keys are stored.
   */
  get itemCount(): number {
    return this.pairs.size;
  }

  /**
   * The size of the stored data in bytes.
   *
   * CloudFront counts a key value store against a size quota, and the data API
   * reports this alongside the item count on every write. Both the key and the
   * value count towards it.
   */
  get totalSizeInBytes(): number {
    return this.pairs
      .entries()
      .reduce(
        (total, [key, value]) =>
          total + Buffer.byteLength(key) + Buffer.byteLength(value),
        0,
      );
  }
}
