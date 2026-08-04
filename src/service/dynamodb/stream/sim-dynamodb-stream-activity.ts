/**
 * Something outside DynamoDB waiting for changes on a table's stream.
 *
 * A Lambda event source mapping is the one this exists for: real Lambda polls a
 * stream continuously, and nothing in this simulation runs continuously, so the
 * stream says when there is something to poll for instead.
 */
export interface SimDynamoDbStreamWatcher {
  /**
   * A record has been written, and can be read now.
   *
   * There is no instant here, unlike the queue watcher this mirrors. A stream
   * record is readable the moment it is written: nothing delays one, and
   * nothing hides one that has been handed out.
   */
  recordsAvailable(): void;
}

/**
 * What a consumer that cannot poll continuously needs from the streams of one
 * simulated DynamoDB: to be told when a record has been written.
 *
 * Watchers are held by stream ARN rather than on the stream itself, so a
 * watcher survives whatever the stream does, and so the stream model stays a
 * log rather than a subscription list.
 */
export class SimDynamoDbStreamActivity {
  private readonly watchers = new Map<string, SimDynamoDbStreamWatcher[]>();

  /**
   * Watch a stream for the records written to it.
   */
  watch(streamArn: string, watcher: SimDynamoDbStreamWatcher): void {
    this.watchers.set(streamArn, [...this.watchersOf(streamArn), watcher]);
  }

  /**
   * Stop watching a stream.
   */
  unwatch(streamArn: string, watcher: SimDynamoDbStreamWatcher): void {
    this.watchers.set(
      streamArn,
      this.watchersOf(streamArn).filter((held) => held !== watcher),
    );
  }

  /**
   * Tell a stream's watchers that there is something to read.
   */
  recordsAvailable(streamArn: string): void {
    for (const watcher of this.watchersOf(streamArn)) {
      watcher.recordsAvailable();
    }
  }

  private watchersOf(streamArn: string): readonly SimDynamoDbStreamWatcher[] {
    return this.watchers.get(streamArn) ?? [];
  }
}
