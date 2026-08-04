/**
 * The running side of one event source mapping.
 *
 * A mapping is state a request can read; a poller is the thing behind it that
 * actually delivers. Each kind of event source has its own poller, and this is
 * all `SimLambdaEventSourcePollers` needs from any of them: start watching,
 * poll now, stop.
 */
export interface SimLambdaEventSourcePoller {
  /**
   * Watch the event source this mapping polls, so something arriving on it
   * wakes a poll.
   */
  watch(): void;

  /**
   * Poll as soon as the simulation gets to it, which is what a newly enabled
   * mapping does with whatever is already waiting.
   */
  pollNow(): void;

  /**
   * Stop polling, as deleting the mapping does.
   */
  stop(): void;
}
