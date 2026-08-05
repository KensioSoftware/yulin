import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The properties an imported API cannot also carry.
 *
 * `ImportApi` takes neither, and nothing here changes an API after it is
 * created, so a template asking for one alongside a `Body` gets an API without
 * it. AWS applies both by updating the imported API afterwards.
 */
const droppedAlongsideBody = new Set([
  "Description",
  "DisableExecuteApiEndpoint",
]);

interface SimCfnHttpApiPropertyRulesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * The AWS::ApiGatewayV2::Api rules about which properties may appear together.
 *
 * Each one says why that combination cannot be deployed as written, rather
 * than falling back on the generic "not simulated" wording. Which of them
 * refuses the Resource and which records it and carries on turns on what real
 * CloudFormation does with the same template: a property AWS has no such thing
 * as, or one asking for a WebSocket API, is a template AWS refuses too, and one
 * AWS quietly applies in a second step is one to create the API without and
 * report.
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
   * Record a `FailOnWarnings` on an API that imports nothing.
   *
   * There are no import warnings without an import, so the property says
   * nothing about this API either way, and real CloudFormation accepts the
   * same template.
   */
  ignoreFailOnWarningsWithoutBody(): void {
    this.ignore(
      "FailOnWarnings",
      "it says what to do with the warnings an OpenAPI import finds, and " +
        "this Resource has no Body to import",
    );
  }

  /**
   * Record the properties an imported API cannot be created with.
   */
  ignoreUnimportableProperties(): void {
    for (const name of Object.keys(this.properties)) {
      if (droppedAlongsideBody.has(name)) {
        this.ignore(
          name,
          "ImportApi does not take it, and nothing here changes an API after " +
            "it is created, so the API is created without it where real AWS " +
            "would apply it in a second step",
        );
      }
    }
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
   * Record a property this Resource carries and is created without, if it
   * carries it.
   */
  private ignore(name: string, reason: string): void {
    if (!Object.keys(this.properties).includes(name)) {
      return;
    }

    this.resource.ignoreProperty(
      name,
      `AWS::ApiGatewayV2::Api property ${name} is not applied: ${reason}`,
    );
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
