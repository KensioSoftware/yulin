import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiAuthorizer } from "../api/authorizer/sim-rest-api-authorizer.js";
import type { SimRestApiResource } from "../api/resource/sim-rest-api-resource.js";
import type { SimRestApiStage } from "../api/stage/sim-rest-api-stage.js";
import type { SimApiGateway } from "../sim-api-gateway.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import {
  simCfnRestApiPart,
  simCfnRestApiPartProperty,
} from "./sim-cfn-rest-api-part-values.js";

interface SimCfnRestApiPartDeleterProperties {
  readonly apiGateway: SimApiGateway;
}

/**
 * Deletes the parts of a REST API a CloudFormation Stack declared as their own
 * Resources.
 *
 * Each is addressed by the API it belongs to and by whatever else names it,
 * all read from the Resource's own properties, which is where creation read
 * them from. They still resolve because the API outlives everything declared
 * on it.
 *
 * The Stack tears down in reverse dependency order, so a method goes before
 * the resource it was declared on and a stage before its deployment. That
 * matters because deleting a resource takes the subtree with it, and a child
 * Resource deleted afterwards would name a node the parent's deletion had
 * already removed.
 */
export class SimCfnRestApiPartDeleter {
  private readonly apiGateway: SimApiGateway;

  constructor(properties: SimCfnRestApiPartDeleterProperties) {
    this.apiGateway = properties.apiGateway;
  }

  /**
   * Delete one part of a REST API, or report a part type nothing deletes.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const restApiId = simCfnRestApiPartProperty(
      resource,
      properties["RestApiId"],
      "RestApiId",
    );

    switch (resourceTypeName) {
      case "Resource": {
        const { resourceId } = simCfnRestApiPart<SimRestApiResource>(resource);

        await this.apiGateway.deleteResource(
          { input: { restApiId, resourceId } },
          options,
        );

        return;
      }
      case "Authorizer": {
        const { authorizerId } =
          simCfnRestApiPart<SimRestApiAuthorizer>(resource);

        await this.apiGateway.deleteAuthorizer(
          { input: { restApiId, authorizerId } },
          options,
        );

        return;
      }
      case "Method": {
        const resourceId = simCfnRestApiPartProperty(
          resource,
          properties["ResourceId"],
          "ResourceId",
        );
        const httpMethod = simCfnRestApiPartProperty(
          resource,
          properties["HttpMethod"],
          "HttpMethod",
        );

        await this.apiGateway.deleteMethod(
          { input: { restApiId, resourceId, httpMethod } },
          options,
        );

        return;
      }
      case "Stage": {
        const { stageName } = simCfnRestApiPart<SimRestApiStage>(resource);

        await this.apiGateway.deleteStage(
          { input: { restApiId, stageName } },
          options,
        );

        return;
      }
      default: {
        throw new Error(
          `Unsupported sim API Gateway CloudFormation Resource ` +
            `${resourceTypeName} deletion`,
        );
      }
    }
  }
}
