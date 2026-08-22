/**
 * Something outside Kinesis waiting for records on a stream.
 *
 * A Lambda event source mapping is the one this exists for. Real Lambda polls a
 * stream continuously, and nothing in this simulation runs continuously, so the
 * stream says when there is something to poll for instead.
 */
export interface SimKinesisStreamWatcher {
  /**
   * A record has been put, and can be read now.
   *
   * There is no instant here, unlike the queue watcher this mirrors. A stream
   * record is readable the moment it is put: nothing delays one, and nothing
   * hides one that has been handed out.
   */
  recordsAvailable(): void;
}

/**
 * What a consumer that cannot poll continuously needs from the streams of one
 * simulated Kinesis: to be told when a record has been put.
 *
 * Watchers are held by stream ARN rather than on the stream itself, so a
 * watcher survives whatever the stream does, and so the stream model stays a
 * log rather than a subscription list.
 */
export class SimKinesisStreamActivity {
  private readonly watchers = new Map<string, SimKinesisStreamWatcher[]>();

  /**
   * Watch a stream for the records put onto it.
   */
  watch(streamArn: string, watcher: SimKinesisStreamWatcher): void {
    this.watchers.set(streamArn, [...this.watchersOf(streamArn), watcher]);
  }

  /**
   * Stop watching a stream.
   */
  unwatch(streamArn: string, watcher: SimKinesisStreamWatcher): void {
    const remaining = this.watchersOf(streamArn).filter(
      (held) => held !== watcher,
    );

    if (remaining.length === 0) {
      // A stream nothing watches any more is forgotten. Keeping the empty list
      // would grow one entry per stream ever watched, for the life of the
      // simulation.
      this.watchers.delete(streamArn);

      return;
    }

    this.watchers.set(streamArn, [...remaining]);
  }

  /**
   * Tell a stream's watchers that there is something to read.
   */
  recordsAvailable(streamArn: string): void {
    for (const watcher of this.watchersOf(streamArn)) {
      watcher.recordsAvailable();
    }
  }

  private watchersOf(streamArn: string): readonly SimKinesisStreamWatcher[] {
    return this.watchers.get(streamArn) ?? [];
  }
}
