/**
 * What one delivery stream has taken and not yet delivered.
 *
 * Firehose delivers a buffer as one S3 Object holding the records concatenated,
 * with no separator between them. A producer that wants its records to arrive
 * as lines puts the newline on the end of each record itself, which is what
 * every Firehose to S3 pipeline does.
 */
export class SimFirehoseBuffer {
  private records: Uint8Array[] = [];
  private bytes = 0;

  /**
   * How many bytes the buffer is holding.
   */
  get byteLength(): number {
    return this.bytes;
  }

  /**
   * How many records the buffer is holding.
   */
  get recordCount(): number {
    return this.records.length;
  }

  /**
   * Whether there is anything here to deliver.
   */
  get isEmpty(): boolean {
    return this.records.length === 0;
  }

  /**
   * Take a record onto the buffer.
   */
  add(data: Uint8Array): void {
    this.records.push(data);
    this.bytes += data.byteLength;
  }

  /**
   * Empty the buffer into the bytes one Object holds.
   *
   * Taking and emptying happen together so that a record put while a delivery
   * is under way joins the next buffer rather than being delivered twice.
   */
  take(): Uint8Array {
    const object = new Uint8Array(this.bytes);
    let offset = 0;

    for (const record of this.records) {
      object.set(record, offset);
      offset += record.byteLength;
    }

    this.records = [];
    this.bytes = 0;

    return object;
  }
}
