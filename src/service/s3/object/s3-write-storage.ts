import {
  simS3DefaultServerSideEncryption,
  simS3ServerSideEncryptionFrom,
  type SimS3ServerSideEncryption,
} from "./s3-server-side-encryption.js";
import {
  simS3StorageClassFrom,
  type SimS3StorageClass,
} from "./s3-storage-class.js";

/**
 * The members of a request that say where and how S3 keeps an Object.
 *
 * `PutObject`, `CopyObject` and `CreateMultipartUpload` all carry these
 * alongside the metadata that says what the Object is. Both are read before
 * anything is stored, because real S3 refuses a write naming a storage class
 * or an algorithm it has no such thing for.
 */
export interface SimS3ObjectWriteStorage {
  readonly StorageClass?: string | undefined;
  readonly ServerSideEncryption?: string | undefined;
}

/**
 * The storage class a write asks for, or nothing where it asks for none.
 */
export function simS3WriteStorageClass(
  input: SimS3ObjectWriteStorage,
  context: string,
): SimS3StorageClass | undefined {
  return simS3StorageClassFrom(input.StorageClass, context);
}

/**
 * The encryption S3 stamps on the Object a write is storing.
 *
 * The write has the last word, the Bucket's default configuration comes next,
 * and an Object written into a Bucket carrying neither is SSE-S3 encrypted.
 * Real S3 has encrypted every new Object that way since January 2023, so
 * `AES256` is what a read reports for one nobody configured anything for.
 */
export function simS3WriteEncryption(
  input: SimS3ObjectWriteStorage,
  bucketDefault: SimS3ServerSideEncryption | undefined,
  context: string,
): SimS3ServerSideEncryption {
  return (
    simS3ServerSideEncryptionFrom(input.ServerSideEncryption, context) ??
    bucketDefault ??
    simS3DefaultServerSideEncryption
  );
}
