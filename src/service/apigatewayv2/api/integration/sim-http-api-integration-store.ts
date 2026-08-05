import {
  type SimHttpApiIntegration,
  type SimHttpApiIntegrationId,
  makeSimHttpApiIntegrationId,
} from "./sim-http-api-integration.js";

/**
 * The integrations of one API, keyed by the id the API allocated for them.
 *
 * Integrations belong to an API on real AWS, so ids only have to be unique
 * within one, and this store is what makes them so.
 */
export class SimHttpApiIntegrationStore {
  private readonly integrations = new Map<
    SimHttpApiIntegrationId,
    SimHttpApiIntegration
  >();

  /**
   * Allocate an integration id this API is not already using.
   */
  allocateId(): SimHttpApiIntegrationId {
    let integrationId = makeSimHttpApiIntegrationId();

    while (this.integrations.has(integrationId)) {
      /* v8 ignore next -- does not happen in practice */
      integrationId = makeSimHttpApiIntegrationId();
    }

    return integrationId;
  }

  /**
   * Add an integration to this API.
   */
  add(integration: SimHttpApiIntegration): void {
    this.integrations.set(integration.integrationId, integration);
  }

  /**
   * Find an integration by id.
   */
  find(integrationId: string): SimHttpApiIntegration | undefined {
    return this.integrations.get(integrationId as SimHttpApiIntegrationId);
  }

  /**
   * Forget a deleted integration.
   */
  remove(integrationId: SimHttpApiIntegrationId): void {
    this.integrations.delete(integrationId);
  }

  /**
   * List every integration of this API, in the order they were created.
   */
  list(): SimHttpApiIntegration[] {
    return this.integrations.values().toArray();
  }
}
