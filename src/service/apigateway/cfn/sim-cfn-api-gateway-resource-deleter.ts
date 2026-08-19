import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import type { SimApiGateway } from "../sim-api-gateway.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimCfnRestApiPartDeleter } from "./sim-cfn-rest-api-part-deleter.js";

interface SimCfnApiGatewayResourceDeleterProperties {
  readonly apiGateway: SimApiGateway;
}

/**
 * Deletes the simulated API Gateway REST API resources a CloudFormation Stack
 * created.
 *
 * The API itself is the only Resource type addressed by nothing but its own
 * object. Everything else is a part of an API, and is deleted by
 * SimCfnRestApiPartDeleter, which knows to find the API first.
 *
 * A deployment is the one part with no delete of its own. API Gateway deletes
 * one, and this simulation has no command for it, so the Resource is reported
 * as a deletion nothing carried out. The deployment goes when its API does,
 * which is the same Stack teardown a moment later.
 */
export class SimCfnApiGatewayResourceDeleter {
  private readonly apiGateway: SimApiGateway;
  private readonly partDeleter: SimCfnRestApiPartDeleter;

  constructor(properties: SimCfnApiGatewayResourceDeleterProperties) {
    this.apiGateway = properties.apiGateway;
    this.partDeleter = new SimCfnRestApiPartDeleter(properties);
  }

  /**
   * Delete a simulated API Gateway REST API resource created from a
   * CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    if (resourceTypeName !== "RestApi") {
      await this.partDeleter.delete(resourceTypeName, resource, properties);

      return;
    }

    const restApi = resource.simResource as SimRestApi | undefined;
    assertDefined(
      restApi,
      `sim REST API for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.apiGateway.deleteRestApi({
      input: { restApiId: restApi.apiId },
    });
  }
}
