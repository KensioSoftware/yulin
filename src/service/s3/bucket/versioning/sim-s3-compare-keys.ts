/**
 * Order two Object keys the way S3 orders them.
 *
 * S3 orders keys by their UTF-8 bytes. Comparing the strings directly agrees
 * with that for every key outside the supplementary planes, and `localeCompare`
 * does not, because it collates by locale and can order the same two keys
 * differently on two runtimes. `compareObjectKeys` in the Object listing
 * compares the same way for the same reason.
 */
export function compareSimS3Keys(left: string, right: string): number {
  /* v8 ignore if -- a Bucket holds one Object per key, so no two keys are equal */
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
