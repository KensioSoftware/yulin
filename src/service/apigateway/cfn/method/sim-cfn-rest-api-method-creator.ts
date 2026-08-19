import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiMethod } from "../../api/method/sim-rest-api-method.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";
import { SimCfnRestApiMethodProperties } from "./sim-cfn-rest-api-method-properties.js";

interface SimCfnRestApiMethodCreatorProperties {
  readonly apiGateway: SimApiGateway;
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

  constructor(properties: SimCfnRestApiMethodCreatorProperties) {
    this.apiGateway = properties.apiGateway;
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

    await this.apiGateway.putMethod({
      input: methodProperties.putMethodInput(),
    });
    await this.putIntegration(methodProperties);

    const method = this.apiGateway
      .findRestApi(methodProperties.restApiId())
      ?.resources.find(methodProperties.resourceId())
      ?.findMethod(methodProperties.httpMethod());
    assertDefined(
      method,
      `sim REST API method ${methodProperties.httpMethod()} after ` +
        `CloudFormation creation`,
    );

    return method;
  }

  /**
   * Declare what the method does with a request, taking the method back out
   * again where the block cannot be applied.
   *
   * `PutMethod` has already left a method on the resource by this point, and
   * an integration real API Gateway refuses would leave that method behind on
   * a Resource CloudFormation reports as failed. The next deployment of the
   * corrected template would then be refused for a method that already exists.
   */
  private async putIntegration(
    methodProperties: SimCfnRestApiMethodProperties,
  ): Promise<void> {
    try {
      const integrationInput = methodProperties.putIntegrationInput();

      if (integrationInput !== undefined) {
        await this.apiGateway.putIntegration({ input: integrationInput });
      }
    } catch (error) {
      await this.apiGateway.deleteMethod({
        input: {
          restApiId: methodProperties.restApiId(),
          resourceId: methodProperties.resourceId(),
          httpMethod: methodProperties.httpMethod(),
        },
      });

      throw error;
    }
  }
}
