import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimApiGatewayV2 } from "../sim-api-gateway-v2.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import type { SimApiMapping } from "../domain/sim-api-mapping.js";
import type { SimHttpApiDomainName } from "../domain/sim-http-api-domain-name.js";
import { SimCfnHttpApiPartDeleter } from "./sim-cfn-http-api-part-deleter.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimCfnApiGatewayV2ResourceDeleterProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Deletes the simulated API Gateway v2 resources a CloudFormation Stack
 * created.
 *
 * The API and the custom domain name are the Resource types addressed by
 * nothing but their own object. An API mapping is addressed by the domain
 * holding it, and everything else is a part of an API, deleted by
 * SimCfnHttpApiPartDeleter, which knows to find the API first.
 */
export class SimCfnApiGatewayV2ResourceDeleter {
  private readonly apiGatewayV2: SimApiGatewayV2;
  private readonly partDeleter: SimCfnHttpApiPartDeleter;

  constructor(properties: SimCfnApiGatewayV2ResourceDeleterProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
    this.partDeleter = new SimCfnHttpApiPartDeleter(properties);
  }

  /**
   * Delete a simulated API Gateway v2 resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    if (resourceTypeName === "Api") {
      const api = this.deleted<SimHttpApi>(resource, "HTTP API");

      await this.apiGatewayV2.deleteApi({ input: { ApiId: api.apiId } });

      return;
    }

    if (resourceTypeName === "DomainName") {
      const domain = this.deleted<SimHttpApiDomainName>(
        resource,
        "HTTP API domain name",
      );

      await this.apiGatewayV2.deleteDomainName({
        input: { DomainName: domain.domainName },
      });

      return;
    }

    if (resourceTypeName === "ApiMapping") {
      await this.deleteApiMapping(resource, properties);

      return;
    }

    await this.partDeleter.delete(resourceTypeName, resource, properties);
  }

  /**
   * Delete an API mapping, which is addressed by its domain and its own id.
   *
   * The domain name comes from the Resource's own property, where creation
   * read it from, and still resolves because a mapping never outlives the
   * domain holding it.
   */
  private async deleteApiMapping(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    const mapping = this.deleted<SimApiMapping>(resource, "API mapping");
    const domainName = properties["DomainName"];

    /* v8 ignore if -- creation refused the Resource without a DomainName */
    if (typeof domainName !== "string") {
      throw new TypeError(
        `AWS::ApiGatewayV2::ApiMapping ${resource.logicalId} requires a DomainName string to delete`,
      );
    }

    await this.apiGatewayV2.deleteApiMapping({
      input: { DomainName: domainName, ApiMappingId: mapping.apiMappingId },
    });
  }

  private deleted<T extends object>(
    resource: SimCfnResource,
    described: string,
  ): T {
    const simResource = resource.simResource as T | undefined;
    assertDefined(
      simResource,
      `sim ${described} for CloudFormation Resource ${resource.logicalId}`,
    );

    return simResource;
  }
}
