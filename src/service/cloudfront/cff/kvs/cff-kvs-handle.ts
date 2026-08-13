import type { SimCloudFrontKeyValueStore } from "../../key-value-store/sim-cf-key-value-store.js";

/**
 * What a Function may ask a value to be read back as.
 */
export type CffKvsValueFormat = "string" | "json" | "bytes";

/**
 * What `kvs.meta()` answers with.
 */
export interface CffKvsMeta {
  readonly creationDateTime: string;
  readonly lastUpdatedDateTime: string;
  readonly keyCount: number;
}

/**
 * The handle a CloudFront Function gets back from `cf.kvs()`.
 *
 * Every method is a promise, as in the runtime, so a Function reading a store
 * has to be async. It is read-only: a Function can never write to a store, and
 * there is deliberately no method here that would let it.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/kvs-with-functions-associate.html
 */
export class CffKvsHandle {
  constructor(private readonly store: SimCloudFrontKeyValueStore) {}

  /**
   * Read a key, in the format the Function asked for.
   *
   * The default is `string`. `json` parses the stored string, and `bytes`
   * hands back its UTF-8 bytes. A key that is not stored rejects, as in the
   * runtime, rather than resolving to undefined.
   */
  async get(
    key: string,
    options?: { readonly format?: CffKvsValueFormat },
  ): Promise<unknown> {
    // Async so that a missing key rejects the promise rather than throwing
    // before the caller has one. A Function handling the miss with `.catch()`
    // depends on that, and so does one that never awaits the read at all.
    await Promise.resolve();

    const value = this.store.keys.get(key);

    return this.formatted(value, options?.format ?? "string");
  }

  /**
   * Whether a key is in the store.
   */
  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.store.keys.has(key));
  }

  /**
   * The store's metadata, as the runtime reports it.
   */
  meta(): Promise<CffKvsMeta> {
    return Promise.resolve({
      creationDateTime: this.store.createdTime.toISOString(),
      lastUpdatedDateTime: this.store.lastModifiedTime.toISOString(),
      keyCount: this.store.keys.itemCount,
    });
  }

  private formatted(value: string, format: CffKvsValueFormat): unknown {
    switch (format) {
      case "string": {
        return value;
      }
      case "json": {
        return JSON.parse(value);
      }
      case "bytes": {
        return Buffer.from(value, "utf8");
      }
    }
  }
}
