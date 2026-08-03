/**
 * What one key of a DeleteObjects request came to.
 *
 * A batch deletion carries on past a key it could not remove, so the failure
 * travels with the key it belongs to rather than being raised.
 */
export class DeleteObjectAttempt {
  public readonly key: string;
  public readonly error: unknown;

  constructor(key: string, error?: unknown) {
    this.key = key;
    this.error = error;
  }
}
