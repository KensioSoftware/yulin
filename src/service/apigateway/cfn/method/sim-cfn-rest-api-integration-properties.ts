import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPutIntegrationCommandInput } from "../../command/method/method.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";

/**
 * The properties of a method's `Integration` block this simulation deploys.
 *
 * `Credentials`, `PassthroughBehavior`, `RequestParameters`,
 * `RequestTemplates`, `IntegrationResponses`, `ContentHandling`,
 * `TimeoutInMillis`, `ConnectionType`, `ConnectionId`, `CacheKeyParameters`
 * and `CacheNamespace` are left out, so a template carrying one has it
 * recorded against the method and the integration is created without it.
 */
const simulatedProperties = ["Type", "IntegrationHttpMethod", "Uri"];

/**
 * Where an ignored property of the block is recorded, so a reader sees which
 * block of the method it came from.
 */
const integrationPath = "Integration.";

interface SimCfnRestApiIntegrationPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
  readonly restApiId: string;
  readonly resourceId: string;
  readonly httpMethod: string;
}

/**
 * Reads the `Integration` block of an AWS::ApiGateway::Method into the
 * PutIntegration input the method creator needs.
 *
 * A REST API integration is part of its method rather than a Resource of its
 * own, which is why it arrives as a block of the method that declares it. It
 * is addressed by the same API, resource and HTTP method the method is.
 */
export class SimCfnRestApiIntegrationProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly restApiId: string;
  private readonly resourceId: string;
  private readonly httpMethod: string;
  private readonly propertyParser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::Method Integration",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnRestApiIntegrationPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.restApiId = properties.restApiId;
    this.resourceId = properties.resourceId;
    this.httpMethod = properties.httpMethod;

    this.propertyParser.ignoreUnsimulated(
      this.resource,
      this.properties,
      integrationPath,
    );
  }

  /**
   * The PutIntegration input this block asks for.
   *
   * `Type` and `IntegrationHttpMethod` are passed through as the template
   * wrote them, so a MOCK, HTTP, HTTP_PROXY or non-proxy AWS integration is
   * refused by PutIntegration with the reason it refuses it. The `Uri` arrives
   * as the `arn:aws:apigateway:<region>:lambda:path/...` string CDK builds
   * with `Fn::Join`, and is kept as the template wrote it. It is optional
   * here, because a MOCK integration carries none and reaching the refusal
   * that names the type is more use than one about a missing URI.
   */
  putIntegrationInput(): SimPutIntegrationCommandInput {
    return {
      restApiId: this.restApiId,
      resourceId: this.resourceId,
      httpMethod: this.httpMethod,
      type: this.propertyParser.requiredString(
        this.resource,
        this.properties["Type"],
        `${integrationPath}Type`,
      ),
      integrationHttpMethod: this.propertyParser.optionalString(
        this.resource,
        this.properties["IntegrationHttpMethod"],
        `${integrationPath}IntegrationHttpMethod`,
      ),
      uri: this.propertyParser.optionalString(
        this.resource,
        this.properties["Uri"],
        `${integrationPath}Uri`,
      ),
    };
  }
}
