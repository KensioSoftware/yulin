import { SimKinesisResourceNotFoundException } from "../error/sim-kinesis.error.js";
import type { SimKinesisStream } from "./sim-kinesis-stream.js";

/**
 * The streams of one simulated Kinesis scope.
 *
 * Streams are keyed by name, which is the whole of their identity. The name is
 * the resource part of the ARN, and it is unique within one Account and Region.
 *
 * Nothing holds a deleted stream's name. Real Kinesis frees a stream name as
 * soon as the stream is gone, so a name can be reused straight away.
 */
export class SimKinesisStreamStore {
  private readonly streams = new Map<string, SimKinesisStream>();

  /**
   * Every stream in this scope, in name order.
   *
   * ListStreams pages by name and reports them sorted, so the order a page is
   * cut out of has to be the order the paging parameter walks.
   */
  get all(): readonly SimKinesisStream[] {
    return this.streams
      .values()
      .toArray()
      .toSorted((left, right) => left.name.localeCompare(right.name));
  }

  /**
   * Store a newly created stream.
   */
  add(stream: SimKinesisStream): void {
    this.streams.set(stream.name, stream);
  }

  /**
   * Find a stream by name.
   */
  find(name: string): SimKinesisStream | undefined {
    return this.streams.get(name);
  }

  /**
   * Resolve a stream by name, or refuse.
   */
  require(name: string): SimKinesisStream {
    const found = this.find(name);

    if (found === undefined) {
      throw new SimKinesisResourceNotFoundException(
        `Stream ${name} under this account and region does not exist`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted stream.
   */
  remove(stream: SimKinesisStream): void {
    this.streams.delete(stream.name);
  }

  /**
   * Bring every stream here up to date at an instant.
   *
   * All of them rather than the one being read, so that what a test sees of one
   * stream never depends on which other streams it happened to read first.
   */
  applyRetention(instant: Date): void {
    for (const stream of this.streams.values()) {
      stream.applyRetention(instant);
    }
  }
}
