import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The properties an imported API cannot also carry.
 *
 * `ImportRestApi` takes neither, and nothing here changes an API after it is
 * created, so a template asking for one alongside a `Body` gets an API without
 * it. AWS applies both by updating the imported API afterwards.
 */
const droppedAlongsideBody = new Set([
  "Description",
  "DisableExecuteApiEndpoint",
]);

interface SimCfnRestApiPropertyRulesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * The AWS::ApiGateway::RestApi rules about which properties may appear
 * together.
 *
 * Each says why the combination is created the way it is, rather than falling
 * back on the generic "not simulated" wording. What real CloudFormation does
 * with the same template decides which of them records the property and
 * carries on: one AWS quietly applies in a second step is one to create the
 * API without and report.
 */
export class SimCfnRestApiPropertyRules {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnRestApiPropertyRulesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * Whether the `Body` this Resource carries is one the import reads.
   *
   * A Swagger 2.0 document is the other specification, and it is what SAM
   * writes for an `AWS::Serverless::Api` unless the template asks for
   * `OpenApiVersion: 3.0.1`. The API is created through `CreateRestApi`
   * instead, with an empty path tree under its root, and the record says so. A
   * template carrying one deploys on AWS, and failing the stack over the
   * version of a document would take a whole SAM API down with it.
   */
  readsBody(): boolean {
    const body = this.properties["Body"];

    if (body === undefined) {
      return false;
    }

    if (isRecord(body) && body["swagger"] !== undefined) {
      this.ignore(
        "Body",
        "it is a Swagger 2.0 document and only OpenAPI 3.0.x is read. The " +
          "API is created with an empty path tree. Declare the definition " +
          "as OpenAPI 3.0.x to have it imported.",
      );

      return false;
    }

    return true;
  }

  /**
   * Record a `FailOnWarnings` on an API that imports nothing.
   *
   * There are no import warnings without an import, so the property says
   * nothing about this API either way, and real CloudFormation accepts the
   * same template.
   */
  ignoreImportOnlyProperties(): void {
    this.ignore(
      "FailOnWarnings",
      "it says what to do with the warnings an OpenAPI import finds, and " +
        "nothing is imported for this Resource",
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
          "ImportRestApi does not take it, and nothing here changes an API " +
            "after it is created, so the API is created without it where " +
            "real AWS would apply it in a second step",
        );
      }
    }
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
      `AWS::ApiGateway::RestApi property ${name} is not applied: ${reason}`,
    );
  }
}
