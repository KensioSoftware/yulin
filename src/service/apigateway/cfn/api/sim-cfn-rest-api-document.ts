import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";

interface SimCfnRestApiDocumentProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
  readonly propertyParser: SimCfnApiGatewayPropertyParser;
}

/**
 * The OpenAPI document an `AWS::ApiGateway::RestApi` `Body` carries, serialised
 * as `ImportRestApi` takes it.
 *
 * CloudFormation carries the document as an inline JSON object, which is
 * exactly what JSON holds, so serialising it loses nothing and one translator
 * reads the document for both entry points.
 */
export class SimCfnRestApiDocument {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser: SimCfnApiGatewayPropertyParser;

  constructor(properties: SimCfnRestApiDocumentProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The document to import, with `Name` written into it when the template
   * names the API.
   *
   * The document's `info.title` names an imported API, and `Name` names it
   * when the template carries both, so the resolved property is written into
   * the document CloudFormation hands to `ImportRestApi`. Which of the two AWS
   * takes is not established; it affects only the name `GetRestApi` reports.
   */
  serialised(): string {
    const body = this.body();
    const name = this.propertyParser.optionalString(
      this.resource,
      this.properties["Name"],
      "Name",
    );

    if (name === undefined) {
      return JSON.stringify(body);
    }

    const info =
      this.propertyParser.optionalRecord(
        this.resource,
        body["info"],
        "Body.info",
      ) ?? {};

    return JSON.stringify({ ...body, info: { ...info, title: name } });
  }

  /**
   * Whether this document is a Swagger 2.0 one, which is the specification
   * this reads nothing from.
   */
  swagger(): boolean {
    return this.body()["swagger"] !== undefined;
  }

  /**
   * The `Body` property as the JSON object CloudFormation resolved it to.
   */
  private body(): SimCfnTemplateValueRecord {
    const body = this.propertyParser.optionalRecord(
      this.resource,
      this.properties["Body"],
      "Body",
      "an inline OpenAPI document",
    );

    if (body === undefined) {
      throw this.propertyParser.invalidPropertyError(
        this.resource,
        "Body",
        "an inline OpenAPI document",
      );
    }

    return body;
  }
}
