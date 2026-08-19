import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPutIntegrationCommandInput } from "../../command/method/method.command.js";
import type { SimPutMethodCommandInput } from "../../command/method/method.command.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";
import { SimCfnRestApiIntegrationProperties } from "./sim-cfn-rest-api-integration-properties.js";

/**
 * The AWS::ApiGateway::Method properties this simulation deploys.
 *
 * `AuthorizationScopes`, `RequestParameters`, `RequestModels`,
 * `RequestValidatorId` and `MethodResponses` are left out, so a template
 * carrying one has it recorded against the Resource. Scopes belong to a
 * `COGNITO_USER_POOLS` method, which `AuthorizationType` refuses before they
 * matter.
 */
const simulatedProperties = [
  "RestApiId",
  "ResourceId",
  "HttpMethod",
  "AuthorizationType",
  "AuthorizerId",
  "ApiKeyRequired",
  "OperationName",
  "Integration",
];

/**
 * The three values every command reaching one method names it by.
 */
export interface SimCfnRestApiMethodAddress {
  readonly restApiId: string;
  readonly resourceId: string;
  readonly httpMethod: string;
}

interface SimCfnRestApiMethodPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGateway::Method CloudFormation properties into the PutMethod
 * and PutIntegration input the method creator needs.
 */
export class SimCfnRestApiMethodProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::Method",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnRestApiMethodPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The API, node and verb this method is addressed by, which is how every
   * command reaching one names it.
   */
  address(): SimCfnRestApiMethodAddress {
    return {
      restApiId: this.restApiId(),
      resourceId: this.resourceId(),
      httpMethod: this.httpMethod(),
    };
  }

  /**
   * The API this method belongs to, which a template reaches with a `Ref` on
   * its AWS::ApiGateway::RestApi.
   */
  restApiId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["RestApiId"],
      "RestApiId",
    );
  }

  /**
   * The node of the path tree this method is declared on, which a template
   * reaches with a `Ref` on an AWS::ApiGateway::Resource or with
   * `Fn::GetAtt RootResourceId` for a method on the root.
   */
  resourceId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["ResourceId"],
      "ResourceId",
    );
  }

  /**
   * The HTTP verb this method answers, which is `ANY` for every verb the node
   * declares no method of its own for.
   */
  httpMethod(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["HttpMethod"],
      "HttpMethod",
    );
  }

  /**
   * The PutMethod input this Resource asks for.
   *
   * `AuthorizationType`, `AuthorizerId` and `ApiKeyRequired` are passed
   * through as the template wrote them, so a method asking for an
   * authorization type this simulation does not enforce, for an authorizer the
   * API has not got, or for an API key is refused by PutMethod with the reason
   * it refuses it.
   */
  putMethodInput(): SimPutMethodCommandInput {
    return {
      restApiId: this.restApiId(),
      resourceId: this.resourceId(),
      httpMethod: this.httpMethod(),
      authorizationType: this.propertyParser.optionalString(
        this.resource,
        this.properties["AuthorizationType"],
        "AuthorizationType",
      ),
      authorizerId: this.propertyParser.optionalString(
        this.resource,
        this.properties["AuthorizerId"],
        "AuthorizerId",
      ),
      apiKeyRequired: this.propertyParser.optionalBoolean(
        this.resource,
        this.properties["ApiKeyRequired"],
        "ApiKeyRequired",
      ),
      operationName: this.propertyParser.optionalString(
        this.resource,
        this.properties["OperationName"],
        "OperationName",
      ),
    };
  }

  /**
   * The PutIntegration input the method's `Integration` block asks for, where
   * it declares one.
   *
   * A method without one is a method real API Gateway answers 500 for, and a
   * template can leave it out, so the absence is carried through rather than
   * refused.
   */
  putIntegrationInput(): SimPutIntegrationCommandInput | undefined {
    const integration = this.propertyParser.optionalRecord(
      this.resource,
      this.properties["Integration"],
      "Integration",
    );

    if (integration === undefined) {
      return undefined;
    }

    return new SimCfnRestApiIntegrationProperties({
      resource: this.resource,
      properties: integration,
      restApiId: this.restApiId(),
      resourceId: this.resourceId(),
      httpMethod: this.httpMethod(),
    }).putIntegrationInput();
  }
}
