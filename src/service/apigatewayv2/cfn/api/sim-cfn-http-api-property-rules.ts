import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The properties an imported API cannot also carry.
 *
 * `ImportApi` takes neither, and nothing here changes an API after it is
 * created, so a template asking for one alongside a `Body` would get an API
 * that ignored it. AWS applies both by updating the imported API afterwards.
 */
const refusedAlongsideBody = new Set([
  "Description",
  "DisableExecuteApiEndpoint",
]);

interface SimCfnHttpApiPropertyRulesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * The AWS::ApiGatewayV2::Api rules about which properties may appear together,
 * each refused with the reason it cannot be deployed rather than with the
 * generic "not simulated" message.
 */
export class SimCfnHttpApiPropertyRules {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnHttpApiPropertyRulesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * Refuse a `Policy` property.
   *
   * The generic refusal reports a property as not simulated, which reads as a
   * gap that will be filled later. There is no such property on this Resource
   * type: HTTP APIs have no resource policies at all, so the only template
   * carrying one was written for a REST API.
   */
  requireNoResourcePolicy(): void {
    this.refuse(
      "Policy",
      "an HTTP API has no resource policy, and AWS has no such property on " +
        "this Resource type. A resource policy is a REST API feature, " +
        "declared on AWS::ApiGateway::RestApi. Authorize the API's routes " +
        "with AuthorizationType AWS_IAM instead.",
    );
  }

  /**
   * Refuse a `FailOnWarnings` on an API that imports nothing.
   */
  requireBodyForFailOnWarnings(): void {
    this.refuse(
      "FailOnWarnings",
      "it says what to do with the warnings an OpenAPI import finds, and " +
        "this Resource has no Body to import",
    );
  }

  /**
   * Refuse the properties an imported API would silently drop.
   */
  refuseUnimportableProperties(): void {
    const refused = Object.keys(this.properties).find((name) =>
      refusedAlongsideBody.has(name),
    );

    if (refused === undefined) {
      return;
    }

    throw this.error(
      refused,
      "ImportApi does not take it, and nothing here changes an API after it " +
        "is created, so it would be ignored here and applied on real AWS",
    );
  }

  /**
   * Refuse a `ProtocolType` an imported API cannot have.
   */
  requireHttpProtocolType(protocolType: string | undefined): void {
    if (protocolType === undefined || protocolType === "HTTP") {
      return;
    }

    throw this.error(
      "ProtocolType",
      "an OpenAPI document declares an HTTP API, and WebSocket APIs are not " +
        "simulated",
    );
  }

  /**
   * Refuse a property this Resource carries, if it carries it.
   */
  private refuse(name: string, reason: string): void {
    if (!Object.keys(this.properties).includes(name)) {
      return;
    }

    throw this.error(name, reason);
  }

  /**
   * The diagnostic for a property that cannot be deployed as written.
   */
  private error(name: string, reason: string): Error {
    return new Error(
      `AWS::ApiGatewayV2::Api ${this.resource.logicalId} property ${name} ` +
        `cannot be deployed: ${reason}`,
    );
  }
}
