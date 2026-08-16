const eventIdDigits = 20;

/**
 * Source of the identifiers log events are reported under.
 *
 * One of these belongs to a simulated CloudWatch Logs rather than to a stream,
 * so an event ID is unique across the whole service the way the real one is
 * unique across an account. Zero padding keeps them sortable as strings, which
 * is what lets two events sharing a timestamp be read back in the order they
 * arrived.
 */
export class SimLogsEventIds {
  #issued = 0;

  /**
   * The next event ID.
   */
  next(): string {
    this.#issued += 1;

    return String(this.#issued).padStart(eventIdDigits, "0");
  }
}
