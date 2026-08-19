import type { SimApiGateway } from "../../sim-api-gateway.js";
import type {
  SimCfnRestApiMethodAddress,
  SimCfnRestApiMethodProperties,
} from "./sim-cfn-rest-api-method-properties.js";

interface SimCfnRestApiMethodIntegrationProperties {
  readonly apiGateway: SimApiGateway;
}

/**
 * Declares what a method deployed from a template does with a request, taking
 * the method back out again where the `Integration` block cannot be applied.
 *
 * `PutMethod` has already left a method on the resource by this point, and an
 * integration real API Gateway refuses would leave that method behind on a
 * Resource CloudFormation reports as failed. The next deployment of the
 * corrected template would then be refused for a method that already exists.
 */
export class SimCfnRestApiMethodIntegration {
  private readonly apiGateway: SimApiGateway;

  constructor(properties: SimCfnRestApiMethodIntegrationProperties) {
    this.apiGateway = properties.apiGateway;
  }

  /**
   * Put the integration a method's `Integration` block declares.
   */
  async put(
    methodProperties: SimCfnRestApiMethodProperties,
    address: SimCfnRestApiMethodAddress,
  ): Promise<void> {
    try {
      const input = methodProperties.putIntegrationInput();

      if (input !== undefined) {
        await this.apiGateway.putIntegration({ input });
      }
    } catch (error) {
      await this.apiGateway.deleteMethod({ input: address });

      throw error;
    }
  }
}
