import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimHttpApiAuthorization } from "../../api/authorizer/sim-http-api-authorization.js";
import type { SimHttpApiRequestAuthorizer } from "../../api/authorizer/sim-http-api-request-authorizer.js";

interface SimHttpApiAuthorizerDecisionsProperties {
  /**
   * Clock a held decision expires against, so advancing simulated time drops
   * one that was being reused a moment before.
   */
  readonly clock: SimClock;
}

/**
 * Reuses a Lambda authorizer's decision for as long as its
 * `AuthorizerResultTtlInSeconds` says, and makes a new one when there is none
 * to reuse.
 *
 * What is held and what is not is the whole of this: a refusal is held the way
 * an admission is, because AWS holds whatever answer the authorizer gave. An
 * authorizer that could not answer at all is not held, since there is no
 * answer to hold and a request a moment later may find its function working.
 */
export class SimHttpApiAuthorizerDecisions {
  private readonly clock: SimClock;

  constructor(properties: SimHttpApiAuthorizerDecisionsProperties) {
    this.clock = properties.clock;
  }

  /**
   * The decision for these identity source values, made only if there is not
   * one already.
   */
  async decide(
    authorizer: SimHttpApiRequestAuthorizer,
    identitySource: readonly string[],
    invoke: () => Promise<SimHttpApiAuthorization>,
  ): Promise<SimHttpApiAuthorization> {
    const cached = authorizer.results.find(identitySource, this.clock.now());

    if (cached !== undefined) {
      return cached;
    }

    const authorization = await invoke();

    if (this.isAnswer(authorization)) {
      authorizer.results.store(identitySource, this.clock.now(), authorization);
    }

    return authorization;
  }

  /**
   * Whether this is something the authorizer answered, rather than the
   * authorizer failing to answer.
   */
  private isAnswer(authorization: SimHttpApiAuthorization): boolean {
    return authorization.admitted || authorization.kind !== "error";
  }
}
