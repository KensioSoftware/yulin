import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimHttpApiIntegrationStore } from "./integration/sim-http-api-integration-store.js";
import { SimHttpApiRouteStore } from "./route/sim-http-api-route-store.js";
import { SimHttpApiStageStore } from "./stage/sim-http-api-stage-store.js";
import { simHttpApiHost } from "./sim-http-api-host.js";
import { type SimHttpApiMatch, simHttpApiMatch } from "./sim-http-api-match.js";
import type { SimHttpApiId } from "./sim-http-api-id.js";
import {
  type SimHttpApiProtocolType,
  simHttpApiView,
  type SimHttpApiView,
} from "./sim-http-api-view.js";

interface SimHttpApiProperties {
  readonly apiId: SimHttpApiId;
  readonly name: string;
  readonly protocolType: SimHttpApiProtocolType;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createdDate: Date;
  readonly description?: string | undefined;
  readonly disableExecuteApiEndpoint?: boolean | undefined;
}

/**
 * A simulated API Gateway HTTP API.
 *
 * The API is the aggregate root for everything under it. Routes, integrations
 * and stages are all addressed by an ApiId on real AWS and cannot exist
 * without one, so they are owned here rather than kept in service-level maps
 * that would have to carry the ApiId around with them.
 */
export class SimHttpApi {
  public readonly apiId: SimHttpApiId;
  public readonly name: string;
  public readonly protocolType: SimHttpApiProtocolType;
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly createdDate: Date;
  public readonly description?: string | undefined;
  public readonly disableExecuteApiEndpoint: boolean;

  public readonly integrations = new SimHttpApiIntegrationStore();
  public readonly routes = new SimHttpApiRouteStore();
  public readonly stages = new SimHttpApiStageStore();

  constructor(properties: SimHttpApiProperties) {
    this.apiId = properties.apiId;
    this.name = properties.name;
    this.protocolType = properties.protocolType;
    this.accountRegionScope = properties.accountRegionScope;
    this.createdDate = properties.createdDate;
    this.description = properties.description;
    this.disableExecuteApiEndpoint =
      properties.disableExecuteApiEndpoint ?? false;
  }

  /**
   * The hostname of the endpoint API Gateway generates for this API.
   */
  get hostname(): string {
    return simHttpApiHost({
      apiId: this.apiId,
      regionName: this.accountRegionScope.regionName,
    });
  }

  /**
   * The generated endpoint for this API, which is what `ApiEndpoint` reports.
   *
   * It has no trailing slash, as real API Gateway returns it, so appending a
   * path to it produces the URL of a request to the `$default` stage.
   */
  get apiEndpoint(): string {
    return `https://${this.hostname}`;
  }

  /**
   * Find what should handle one request to this API.
   */
  match(): SimHttpApiMatch | undefined {
    return simHttpApiMatch(this);
  }

  /**
   * Get the AWS-like view of this API.
   */
  view(): SimHttpApiView {
    return simHttpApiView(this);
  }
}
