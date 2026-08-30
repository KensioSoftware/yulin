/**
 * The kinds of request a pool counts, and can be told to turn away.
 *
 * These are the four real Cognito keeps a `*Successes` and a `*Throttles`
 * metric for. The operation names the pair rather than either metric, because
 * one request writes to both.
 */
export type SimCognitoThrottledOperation =
  | "SignIn"
  | "SignUp"
  | "TokenRefresh"
  | "Federation";

/**
 * How many requests of each kind a pool has been told to turn away.
 *
 * Real Cognito turns a request away when the account has gone over a rate
 * limit, and those limits are per account and mostly undocumented. Working one
 * out here would be inventing a number, and a test asserting against an
 * invented number proves nothing about a real pool. So a test says how many
 * requests to refuse instead, and the pool refuses that many and no more.
 *
 * A pool refuses nothing until a test asks it to.
 */
export class SimCognitoRequestThrottle {
  readonly #queued = new Map<SimCognitoThrottledOperation, number>();

  /** Turn away the next `count` sign-in requests. */
  signIns(count: number): void {
    this.queue("SignIn", count);
  }

  /** Turn away the next `count` registrations. */
  signUps(count: number): void {
    this.queue("SignUp", count);
  }

  /** Turn away the next `count` renewals from a refresh token. */
  tokenRefreshes(count: number): void {
    this.queue("TokenRefresh", count);
  }

  /** Turn away the next `count` sign-ins through an identity provider. */
  federations(count: number): void {
    this.queue("Federation", count);
  }

  /**
   * Take one refusal for this operation, answering with whether there was one
   * to take. A request that takes one is the request being turned away.
   */
  takesOne(operation: SimCognitoThrottledOperation): boolean {
    const left = this.#queued.get(operation) ?? 0;

    if (left < 1) {
      return false;
    }

    this.#queued.set(operation, left - 1);

    return true;
  }

  private queue(operation: SimCognitoThrottledOperation, count: number): void {
    this.#queued.set(operation, (this.#queued.get(operation) ?? 0) + count);
  }
}
