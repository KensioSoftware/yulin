/**
 * The sequence numbers events about one Object key carry.
 *
 * Real S3 gives every create and remove event a hexadecimal string that orders
 * the events for one key, so a consumer holding an index can tell a late
 * arrival from a later change. It says nothing about the order of events on
 * different keys, which is why the count is kept per key.
 *
 * The values are fixed width so a plain string comparison orders them, where
 * real S3's vary in length and have to be left-padded before comparing.
 */
export class SimS3ObjectSequencers {
  private readonly counts = new Map<string, number>();

  /**
   * The next sequence number for an Object key.
   */
  next(bucketName: string, key: string): string {
    const id = `${bucketName}/${key}`;
    const count = (this.counts.get(id) ?? 0) + 1;
    this.counts.set(id, count);

    return count.toString(16).toUpperCase().padStart(16, "0");
  }
}
