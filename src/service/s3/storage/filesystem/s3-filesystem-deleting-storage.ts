import { unlinkFilesystemS3File } from "./s3-filesystem-deletion.js";
import {
  FilesystemS3BucketStorage,
  type FilesystemS3BucketStorageProperties,
} from "./s3-filesystem-storage.js";

interface FilesystemS3MountStorageProperties extends FilesystemS3BucketStorageProperties {
  /**
   * Whether the mount asked to be able to delete the files under it.
   */
  readonly allowDelete?: boolean | undefined;
}

/**
 * Filesystem-backed storage for a mount that asked to be able to delete.
 *
 * A mounted Bucket refuses a delete by default, for the reason
 * `FilesystemS3BucketStorage.deleteObject` gives. `allowDelete` on the mount
 * is what puts this in its place, and the Bucket then deletes the way an
 * in-memory one does.
 */
export class DeletingFilesystemS3BucketStorage extends FilesystemS3BucketStorage {
  /**
   * Remove the file backing a simulated Object.
   *
   * The removal is reported, so the Bucket raises the event a removal raises,
   * and the key goes through the same safety checks a read and a write do. A
   * delete naming a path or a file type those refuse is refused here too.
   */
  override async deleteObject(key: string): Promise<boolean> {
    return await unlinkFilesystemS3File(this.objectKeys.filePathFor(key));
  }
}

/**
 * The storage a mounted directory gets, deleting only where the mount said so.
 *
 * The choice is made once, when the directory is mounted, so a Bucket that may
 * delete and a Bucket that may not are two different pieces of storage rather
 * than one holding a flag.
 */
export function filesystemS3MountStorage(
  properties: FilesystemS3MountStorageProperties,
): FilesystemS3BucketStorage {
  return properties.allowDelete === true
    ? new DeletingFilesystemS3BucketStorage(properties)
    : new FilesystemS3BucketStorage(properties);
}
