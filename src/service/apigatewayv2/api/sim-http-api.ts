import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimHttpApiAuthorizerStore } from "./authorizer/sim-http-api-authorizer-store.js";
import type { SimHttpApiJwtIssuerKeys } from "./authorizer/sim-http-api-jwt-issuer-keys.js";
import { SimHttpApiIntegrationStore } from "./integration/sim-http-api-integration-store.js";
import { SimHttpApiRouteStore } from "./route/sim-http-api-route-store.js";
import { SimHttpApiStageStore } from "./stage/sim-http-api-stage-store.js";
import { SimApiGatewayV2BadRequest } from "../error/sim-api-gateway-v2.error.js";
import { simHttpApiHost, simHttpApiLogicalHost } from "./sim-http-api-host.js";
import {
  type SimHttpApiMatch,
  SimHttpApiMatcher,
  type SimHttpApiStageRequest,
} from "./sim-http-api-match.js";
import type { SimHttpApiId } from "./sim-http-api-id.js";
import type { SimHttpApiRequest } from "./sim-http-api-request.js";
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
  readonly jwtIssuerKeys: SimHttpApiJwtIssuerKeys;
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

  /**
   * The issuers this API's JWT authorizers can reach.
   *
   * An authorizer names an issuer by URL and verifies against the keys that
   * issuer publishes, so the API carries the one thing that turns a URL into
   * keys. It is here rather than on the service because a served request finds
   * the API and nothing else.
   */
  public readonly jwtIssuerKeys: SimHttpApiJwtIssuerKeys;

  public readonly authorizers = new SimHttpApiAuthorizerStore();
  public readonly integrations = new SimHttpApiIntegrationStore();
  public readonly routes = new SimHttpApiRouteStore();
  public readonly stages = new SimHttpApiStageStore();

  private readonly matcher = new SimHttpApiMatcher();

  constructor(properties: SimHttpApiProperties) {
    this.apiId = properties.apiId;
    this.name = properties.name;
    this.protocolType = properties.protocolType;
    this.accountRegionScope = properties.accountRegionScope;
    this.createdDate = properties.createdDate;
    this.jwtIssuerKeys = properties.jwtIssuerKeys;
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
   * The generated endpoint's hostname without the AWS domain, which is the
   * form a request arriving at the simulator carries.
   */
  get logicalHostname(): string {
    return simHttpApiLogicalHost({
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
  match(request: SimHttpApiRequest): SimHttpApiMatch | undefined {
    return this.matcher.match(this, request);
  }

  /**
   * Find what should handle one request whose stage an API mapping already
   * named, which is how a request through a custom domain arrives.
   */
  matchInStage(request: SimHttpApiStageRequest): SimHttpApiMatch | undefined {
    return this.matcher.matchInStage(this, request);
  }

  /**
   * Ensure no route still sends requests to an integration, which is what real
   * API Gateway requires before it will delete one.
   *
   * The refusal is the ordering constraint anything tearing an API down has to
   * respect: the routes come off first, then the integration behind them. It
   * lives here because the routes and the integrations are both this API's,
   * and the rule is about how they relate rather than about the command.
   */
  assertIntegrationDeletable(integrationId: string): void {
    const routing = this.routes.findByIntegrationId(integrationId);

    if (routing.length === 0) {
      return;
    }

    const routeKeys = routing.map((route) => route.routeKey).join(", ");

    throw new SimApiGatewayV2BadRequest(
      `Integration ${integrationId} on API ${this.apiId} cannot be deleted ` +
        `while it is the target of ${routeKeys}. Delete those routes first.`,
    );
  }

  /**
   * Get the AWS-like view of this API.
   */
  view(): SimHttpApiView {
    return simHttpApiView(this);
  }
}
