import { SimS3InvalidStorageClass } from "../error/sim-s3.error.js";

/**
 * The storage class S3 puts an Object in when the write names none.
 *
 * Reported rather than omitted from a listing, because a listing that leaves it
 * out reads as an Object of unknown class. Real S3 answers `STANDARD` there and
 * leaves the `x-amz-storage-class` header off a read of one, which is what
 * `simS3ReportedStorageClass` is for.
 */
export const simS3DefaultStorageClass = "STANDARD";

/**
 * The storage classes an Object can be in.
 *
 * These are the ones a write can name or a lifecycle rule can transition to.
 * Nothing here changes what a read costs or how long it takes, so the class is
 * a fact about the Object that S3 reports and applies its rules to.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html
 */
export const simS3StorageClasses = [
  simS3DefaultStorageClass,
  "REDUCED_REDUNDANCY",
  "STANDARD_IA",
  "ONEZONE_IA",
  "INTELLIGENT_TIERING",
  "GLACIER_IR",
  "GLACIER",
  "DEEP_ARCHIVE",
  "EXPRESS_ONEZONE",
  "OUTPOSTS",
  "SNOW",
] as const;

/**
 * One storage class an Object can be in.
 */
export type SimS3StorageClass = (typeof simS3StorageClasses)[number];

/**
 * Read the storage class a request named, refusing one S3 has no such class
 * for.
 *
 * A request naming none leaves the Object in the default class. Real S3
 * answers `InvalidStorageClass` for a name it does not know, and does it
 * before storing anything.
 */
export function simS3StorageClassFrom(
  value: string | undefined,
  context: string,
): SimS3StorageClass | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isSimS3StorageClass(value)) {
    throw new SimS3InvalidStorageClass(
      `${value} is not an S3 storage class for ${context}. It is one of ` +
        `${simS3StorageClasses.join(", ")}.`,
    );
  }

  return value;
}

/**
 * The storage class a read of an Object reports, which is nothing for one in
 * the default class.
 *
 * Real S3 leaves `x-amz-storage-class` off a `GetObject` or a `HeadObject`
 * response for a Standard Object, and sets it for every other class. A listing
 * is the other way around and always carries one.
 */
export function simS3ReportedStorageClass(
  storageClass: SimS3StorageClass,
): SimS3StorageClass | undefined {
  return storageClass === simS3DefaultStorageClass ? undefined : storageClass;
}

/**
 * Whether a value names a storage class.
 */
export function isSimS3StorageClass(value: string): value is SimS3StorageClass {
  return (simS3StorageClasses as readonly string[]).includes(value);
}
