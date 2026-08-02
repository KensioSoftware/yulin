import {
  makeSimHttpApiAuthorizerId,
  type SimHttpApiAuthorizer,
  type SimHttpApiAuthorizerId,
} from "./sim-http-api-authorizer.js";

/**
 * The authorizers of one API, keyed by the id the API allocated for them.
 *
 * Authorizers belong to an API on real AWS, so ids only have to be unique
 * within one, and this store is what makes them so.
 */
export class SimHttpApiAuthorizerStore {
  private readonly authorizers = new Map<
    SimHttpApiAuthorizerId,
    SimHttpApiAuthorizer
  >();

  /**
   * Allocate an authorizer id this API is not already using.
   */
  allocateId(): SimHttpApiAuthorizerId {
    let authorizerId = makeSimHttpApiAuthorizerId();

    while (this.authorizers.has(authorizerId)) {
      /* v8 ignore next -- does not happen in practice */
      authorizerId = makeSimHttpApiAuthorizerId();
    }

    return authorizerId;
  }

  /**
   * Add an authorizer to this API.
   */
  add(authorizer: SimHttpApiAuthorizer): void {
    this.authorizers.set(authorizer.authorizerId, authorizer);
  }

  /**
   * Find an authorizer by id.
   */
  find(authorizerId: string): SimHttpApiAuthorizer | undefined {
    return this.authorizers.get(authorizerId as SimHttpApiAuthorizerId);
  }

  /**
   * Forget a deleted authorizer.
   */
  remove(authorizerId: SimHttpApiAuthorizerId): void {
    this.authorizers.delete(authorizerId);
  }

  /**
   * List every authorizer of this API, in the order they were created.
   */
  list(): SimHttpApiAuthorizer[] {
    return this.authorizers.values().toArray();
  }
}
