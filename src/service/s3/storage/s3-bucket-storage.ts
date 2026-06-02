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

  // /**
  //  * Is it OK to change to a different storage implementation?
  //  */
  // allowChangeStorage(): boolean;
}

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
    const objects = [...this.objects.entries()]
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

  // /**
  //  * Is it OK to change to a different storage implementation?
  //  * To reduce unexpected behaviours, we disallow changing from in-memory
  //  * storage if it currently contains any objects.
  //  */
  // allowChangeStorage(): boolean {
  //   return this.objects.size === 0;
  // }
}

// /**
//  * Maps simulated S3 Objects to files under a directory.
//  */
// export class FilesystemS3BucketStorage implements SimS3BucketStorage {
//   /**
//    * Get a simulated Object from a file in the directory.
//    */
//   getObject(key: string): Promise<SimS3Object | undefined> {
//     return Promise.resolve();
//   }
//
//   /**
//    * List simulated Objects based on files in the directory.
//    */
//   listObjects(prefix?: string): Promise<SimS3Object[]> {
//     return Promise.resolve([]);
//   }
//
//   /**
//    * Store a simulated Object as a file in the directory.
//    * TODO: Keep some kind of manifest for object metadata.
//    */
//   putObject(object: SimS3Object): Promise<void> {
//     return Promise.resolve();
//   }
//
//   /**
//    * Is it OK to change to a different storage implementation?
//    * For now, we're assuming that a user should not need to change from a
//    * filesystem storage at runtime, so this is always false.
//    */
//   allowChangeStorage(): boolean {
//     return false;
//   }
// }
