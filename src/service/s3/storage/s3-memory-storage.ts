import type { SimS3Object } from "../object/s3-object.js";
import type { SimS3BucketStorage } from "./s3-bucket-storage.js";

/**
 * Default in-memory simulated S3 Bucket storage.
 */
export class MemoryS3BucketStorage implements SimS3BucketStorage {
  private readonly objects = new Map<string, SimS3Object>();

  /**
   * Get a simulated Object from in-memory storage.
   */
  getObject(key: string): Promise<SimS3Object | undefined> {
    return Promise.resolve(this.objects.get(key));
  }

  /**
   * List simulated Objects in in-memory storage.
   */
  listObjects(prefix?: string): Promise<SimS3Object[]> {
    const objects = [...this.objects]
      .filter(([key]) => prefix === undefined || key.startsWith(prefix))
      .map(([, object]) => object);

    return Promise.resolve(objects);
  }

  /**
   * Put a simulated Object into in-memory storage.
   */
  putObject(object: SimS3Object): Promise<void> {
    this.objects.set(object.key, object);
    return Promise.resolve();
  }

  /**
   * Remove a simulated Object from in-memory storage.
   *
   * A key that is not stored is not an error, as real S3 answers a deletion the
   * same way whether or not there was anything there.
   */
  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
