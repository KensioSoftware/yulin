import type { SimS3Object } from "../object/s3-object.js";

export interface SimS3BucketStorage {
  /**
   * Put a simulated Object into storage.
   */
  putObject(object: SimS3Object): Promise<void>;

  /**
   * Get a simulated Object from storage.
   */
  getObject(key: string): Promise<SimS3Object | undefined>;

  /**
   * List simulated Objects in storage.
   */
  listObjects(prefix?: string): Promise<SimS3Object[]>;

  /**
   * Remove a simulated Object from storage, reporting whether there was one.
   *
   * S3 deletion is idempotent, so a key that is not stored is not an error.
   * Whether anything was removed is still worth answering, because an Object
   * event notification describes a deletion that happened.
   */
  deleteObject(key: string): Promise<boolean>;
}
