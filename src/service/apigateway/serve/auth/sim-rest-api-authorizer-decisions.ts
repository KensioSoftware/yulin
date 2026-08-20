import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimRestApiAuthorization } from "../../api/authorizer/sim-rest-api-authorization.js";
import type { SimRestApiCacheKey } from "../../api/authorizer/sim-rest-api-authorizer-result-cache.js";
import type { SimRestApiLambdaAuthorizer } from "../../api/authorizer/sim-rest-api-lambda-authorizer.js";

interface SimRestApiAuthorizerDecisionsProperties {
  /**
   * Clock a held decision expires against, so advancing simulated time drops
   * one that was being reused a moment before.
   */
  readonly clock: SimClock;
}

/**
 * Reuses a Lambda authorizer's decision for as long as its
 * `authorizerResultTtlInSeconds` says, and makes a new one when there is none
 * to reuse.
 *
 * What is held and what is not is the whole of this: a refusal is held the way
 * an admission is, because AWS holds whatever answer the authorizer gave. An
 * authorizer that could not answer at all is not held, since there is no
 * answer to hold and a request a moment later may find its function working.
 */
export class SimRestApiAuthorizerDecisions {
  private readonly clock: SimClock;

  constructor(properties: SimRestApiAuthorizerDecisionsProperties) {
    this.clock = properties.clock;
  }

  /**
   * The decision for this identity at this method, made only if there is not
   * one already.
   */
  async decide(
    authorizer: SimRestApiLambdaAuthorizer,
    key: SimRestApiCacheKey,
    invoke: () => Promise<SimRestApiAuthorization>,
  ): Promise<SimRestApiAuthorization> {
    const cached = authorizer.results.find(key, this.clock.now());

    if (cached !== undefined) {
      return cached;
    }

    const authorization = await invoke();

    if (this.isAnswer(authorization)) {
      authorizer.results.store(key, this.clock.now(), authorization);
    }

    return authorization;
  }

  /**
   * Whether this is something the authorizer answered, rather than the
   * authorizer failing to answer.
   */
  private isAnswer(authorization: SimRestApiAuthorization): boolean {
    return authorization.admitted || authorization.kind !== "error";
  }
}
