import type { SimS3Object } from "./s3-object.js";
import type { SimS3ServerSideEncryption } from "./s3-server-side-encryption.js";
import {
  simS3ReportedStorageClass,
  type SimS3StorageClass,
} from "./s3-storage-class.js";

/**
 * What a read says about where and how S3 keeps an Object.
 */
export interface SimS3ObjectStorageReport {
  readonly StorageClass?: SimS3StorageClass;
  readonly ServerSideEncryption?: SimS3ServerSideEncryption;
}

/**
 * Describe where and how S3 keeps an Object, as `GetObject` and `HeadObject`
 * report it.
 *
 * Real S3 leaves the storage class out of a read of a Standard Object and
 * reports it for every other class. An Object's encryption is reported
 * whatever it is, because S3 encrypts every Object it stores.
 */
export function simS3ObjectStorageReport(
  object: SimS3Object,
): SimS3ObjectStorageReport {
  const storageClass = simS3ReportedStorageClass(object.storageClass);

  return {
    ...(storageClass !== undefined && { StorageClass: storageClass }),
    ...(object.serverSideEncryption !== undefined && {
      ServerSideEncryption: object.serverSideEncryption,
    }),
  };
}
