import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimApiGatewayV2 } from "../sim-api-gateway-v2.js";
import type { SimHttpApiAuthorizer } from "../api/authorizer/sim-http-api-authorizer.js";
import type { SimHttpApiIntegration } from "../api/integration/sim-http-api-integration.js";
import type { SimHttpApiRoute } from "../api/route/sim-http-api-route.js";
import type { SimHttpApiStage } from "../api/stage/sim-http-api-stage.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimCfnHttpApiPartDeleterProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Deletes the parts of an HTTP API a CloudFormation Stack declared as their own
 * Resources.
 *
 * Each is addressed by the API it belongs to and its own id. The API id comes
 * from the Resource's `ApiId` property, which is where creation read it from,
 * and still resolves because the API outlives everything declared on it.
 *
 * Deleting an integration a route still targets is refused, which the teardown
 * order avoids: a route's `Target` names its integration, so the route goes
 * first.
 */
export class SimCfnHttpApiPartDeleter {
  private readonly apiGatewayV2: SimApiGatewayV2;

  constructor(properties: SimCfnHttpApiPartDeleterProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
  }

  /**
   * Delete one part of an HTTP API, or report a part type nothing deletes.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    const apiId = this.apiId(resource, properties);

    switch (resourceTypeName) {
      case "Authorizer": {
        const { authorizerId } = this.part<SimHttpApiAuthorizer>(resource);

        await this.apiGatewayV2.deleteAuthorizer({
          input: { ApiId: apiId, AuthorizerId: authorizerId },
        });

        return;
      }
      case "Integration": {
        const { integrationId } = this.part<SimHttpApiIntegration>(resource);

        await this.apiGatewayV2.deleteIntegration({
          input: { ApiId: apiId, IntegrationId: integrationId },
        });

        return;
      }
      case "Route": {
        const { routeId } = this.part<SimHttpApiRoute>(resource);

        await this.apiGatewayV2.deleteRoute({
          input: { ApiId: apiId, RouteId: routeId },
        });

        return;
      }
      case "Stage": {
        const { stageName } = this.part<SimHttpApiStage>(resource);

        await this.apiGatewayV2.deleteStage({
          input: { ApiId: apiId, StageName: stageName },
        });

        return;
      }
      default: {
        throw new Error(
          `Unsupported sim API Gateway v2 CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  private part<T extends object>(resource: SimCfnResource): T {
    const part = resource.simResource as T | undefined;
    assertDefined(
      part,
      `sim HTTP API part for CloudFormation Resource ${resource.logicalId}`,
    );

    return part;
  }

  private apiId(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const apiId = properties["ApiId"];

    /* v8 ignore if -- creation refused the Resource without an ApiId string */
    if (typeof apiId !== "string") {
      throw new TypeError(
        `AWS::ApiGatewayV2 Resource ${resource.logicalId} requires an ApiId string to delete`,
      );
    }

    return apiId;
  }
}
