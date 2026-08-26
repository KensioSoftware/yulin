import type { SimApiMappingKey } from "./sim-api-mapping-key.js";
import type { SimApiMappingId } from "./sim-api-mapping-id.js";

interface SimApiMappingProperties {
  readonly apiMappingId: SimApiMappingId;
  readonly apiMappingKey: SimApiMappingKey;
  readonly apiId: string;
  readonly stage: string;
}

/**
 * Minimal structural API mapping view, as the Create and Get commands return.
 */
export interface SimApiMappingView {
  ApiMappingId: string;
  ApiMappingKey: string;
  ApiId: string;
  Stage: string;
}

/**
 * One API mapping: the base path of a custom domain, and the API and stage
 * that serve requests arriving under it.
 *
 * The mapping names its stage, so a request reaching an API this way never
 * goes through stage selection. That is the difference from the generated
 * endpoint, where the first path segment is what picks the stage.
 */
export class SimApiMapping {
  public readonly apiMappingId: SimApiMappingId;
  public readonly apiMappingKey: SimApiMappingKey;
  public readonly apiId: string;
  public readonly stage: string;

  constructor(properties: SimApiMappingProperties) {
    this.apiMappingId = properties.apiMappingId;
    this.apiMappingKey = properties.apiMappingKey;
    this.apiId = properties.apiId;
    this.stage = properties.stage;
  }

  /**
   * Get the AWS-like view of this API mapping.
   */
  view(): SimApiMappingView {
    return {
      ApiMappingId: this.apiMappingId,
      ApiMappingKey: this.apiMappingKey.value,
      ApiId: this.apiId,
      Stage: this.stage,
    };
  }
}
