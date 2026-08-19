import {
  makeSimRestApiAuthorizerId,
  type SimRestApiAuthorizer,
  type SimRestApiAuthorizerId,
} from "./sim-rest-api-authorizer.js";

/**
 * The authorizers of one REST API, keyed by the id the API allocated.
 *
 * An authorizer belongs to an API on real AWS, so ids only have to be unique
 * within one, and this store is what makes them so.
 */
export class SimRestApiAuthorizerStore {
  private readonly authorizers = new Map<
    SimRestApiAuthorizerId,
    SimRestApiAuthorizer
  >();

  /**
   * Allocate an authorizer id this API is not already using.
   */
  allocateId(): SimRestApiAuthorizerId {
    let authorizerId = makeSimRestApiAuthorizerId();

    while (this.authorizers.has(authorizerId)) {
      /* v8 ignore next -- does not happen in practice */
      authorizerId = makeSimRestApiAuthorizerId();
    }

    return authorizerId;
  }

  /**
   * Add an authorizer to this API.
   */
  add(authorizer: SimRestApiAuthorizer): void {
    this.authorizers.set(authorizer.authorizerId, authorizer);
  }

  /**
   * Find an authorizer by id.
   */
  find(authorizerId: string): SimRestApiAuthorizer | undefined {
    return this.authorizers.get(authorizerId as SimRestApiAuthorizerId);
  }

  /**
   * Forget a deleted authorizer.
   */
  remove(authorizerId: SimRestApiAuthorizerId): void {
    this.authorizers.delete(authorizerId);
  }

  /**
   * List every authorizer of this API, in the order they were created.
   */
  list(): SimRestApiAuthorizer[] {
    return this.authorizers.values().toArray();
  }
}
