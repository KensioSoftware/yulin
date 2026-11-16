/**
 * The most data one BatchGetItem response carries, in bytes.
 */
export const simDynamoDbBatchGetResponseLimitBytes = 16 * 1024 * 1024;

/**
 * How much of the 16 MB a BatchGetItem response may carry is left.
 *
 * Once one item does not fit, nothing after it is read. That item and every
 * key named after it go back in `UnprocessedKeys`, across every table the
 * batch names, for the caller to send again.
 */
export class SimDynamoDbBatchReadBudget {
  private bytesLeft = simDynamoDbBatchGetResponseLimitBytes;
  private exhausted = false;

  /**
   * Whether the response has stopped taking items.
   */
  get spent(): boolean {
    return this.exhausted;
  }

  /**
   * Take an item's size from what is left, answering false and closing the
   * response when it does not fit.
   */
  take(bytes: number): boolean {
    if (this.exhausted || bytes > this.bytesLeft) {
      this.exhausted = true;

      return false;
    }

    this.bytesLeft -= bytes;

    return true;
  }
}
