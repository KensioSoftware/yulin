import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiMethod } from "../../api/method/sim-rest-api-method.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";
import type { SimCfnRestApiImports } from "../sim-cfn-rest-api-imports.js";
import { SimCfnRestApiMethodIntegration } from "./sim-cfn-rest-api-method-integration.js";
import { SimCfnRestApiMethodProperties } from "./sim-cfn-rest-api-method-properties.js";

interface SimCfnRestApiMethodCreatorProperties {
  readonly apiGateway: SimApiGateway;
  readonly imports: SimCfnRestApiImports;
}

/**
 * Creates methods, and the integrations behind them, from
 * AWS::ApiGateway::Method Resources.
 *
 * One Resource is two commands here, because a REST API declares a method and
 * what it does with a request separately. The template writes both as one
 * entry, with the integration as a block of the method, so the two go together
 * or neither does.
 */
export class SimCfnRestApiMethodCreator {
  private readonly apiGateway: SimApiGateway;
  private readonly imports: SimCfnRestApiImports;
  private readonly integration: SimCfnRestApiMethodIntegration;

  constructor(properties: SimCfnRestApiMethodCreatorProperties) {
    this.apiGateway = properties.apiGateway;
    this.imports = properties.imports;
    this.integration = new SimCfnRestApiMethodIntegration(properties);
  }

  /**
   * Create a method from an AWS::ApiGateway::Method Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRestApiMethod> {
    const methodProperties = new SimCfnRestApiMethodProperties({
      resource,
      properties,
    });
    const address = methodProperties.address();
    this.imports.requireNotImported(
      "AWS::ApiGateway::Method",
      resource,
      address.restApiId,
    );

    await this.apiGateway.putMethod({
      input: methodProperties.putMethodInput(),
    });
    await this.integration.put(methodProperties, address);

    const method = this.apiGateway
      .findRestApi(address.restApiId)
      ?.resources.find(address.resourceId)
      ?.findMethod(address.httpMethod);
    assertDefined(
      method,
      `sim REST API method ${address.httpMethod} after CloudFormation creation`,
    );

    return method;
  }
}
