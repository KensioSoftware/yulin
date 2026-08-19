import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiResource } from "../api/resource/sim-rest-api-resource.js";
import type { SimRestApiStage } from "../api/stage/sim-rest-api-stage.js";
import type { SimApiGateway } from "../sim-api-gateway.js";

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
  ): Promise<void> {
    const restApiId = this.restApiId(resource, properties);

    switch (resourceTypeName) {
      case "Resource": {
        const { resourceId } = this.part<SimRestApiResource>(resource);

        await this.apiGateway.deleteResource({
          input: { restApiId, resourceId },
        });

        return;
      }
      case "Method": {
        await this.apiGateway.deleteMethod({
          input: {
            restApiId,
            resourceId: this.property(
              resource,
              properties["ResourceId"],
              "ResourceId",
            ),
            httpMethod: this.property(
              resource,
              properties["HttpMethod"],
              "HttpMethod",
            ),
          },
        });

        return;
      }
      case "Stage": {
        const { stageName } = this.part<SimRestApiStage>(resource);

        await this.apiGateway.deleteStage({
          input: { restApiId, stageName },
        });

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

  /**
   * The simulated object created for this Resource.
   */
  private part<T extends object>(resource: SimCfnResource): T {
    const part = resource.simResource as T | undefined;

    /* v8 ignore if -- a Resource that was never created is not deleted */
    if (part === undefined) {
      throw new TypeError(
        `sim REST API part for CloudFormation Resource ${resource.logicalId} is missing`,
      );
    }

    return part;
  }

  private restApiId(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    return this.property(resource, properties["RestApiId"], "RestApiId");
  }

  private property(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): string {
    /* v8 ignore if -- creation refused the Resource without this string */
    if (typeof value !== "string") {
      throw new TypeError(
        `AWS::ApiGateway Resource ${resource.logicalId} requires a ${name} string to delete`,
      );
    }

    return value;
  }
}
