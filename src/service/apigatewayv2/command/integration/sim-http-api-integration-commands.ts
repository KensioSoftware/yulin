import {
  SimHttpApiIntegration,
  type SimHttpApiPayloadFormatVersion,
} from "../../api/integration/sim-http-api-integration.js";
import { SimHttpApiLambdaUri } from "../../api/integration/sim-http-api-lambda-uri.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimHttpApiAccess } from "../sim-http-api-access.js";
import { SimApiGatewayV2NotFound } from "../../error/sim-api-gateway-v2.error.js";
import type {
  SimCreateIntegrationCommand,
  SimCreateIntegrationCommandOutput,
  SimDeleteIntegrationCommand,
  SimDeleteIntegrationCommandOutput,
  SimGetIntegrationsCommand,
  SimGetIntegrationsCommandOutput,
} from "./integration.command.js";

const integrationsPath = "/integrations";

const acceptedCreateIntegrationOptions = [
  "ApiId",
  "IntegrationType",
  "IntegrationUri",
  "PayloadFormatVersion",
  "Description",
];

const simulatedPayloadFormatVersion: SimHttpApiPayloadFormatVersion = "2.0";

interface SimHttpApiIntegrationCommandsProperties {
  readonly access: SimHttpApiAccess;
}

/**
 * The commands addressing the integrations of an API.
 */
export class SimHttpApiIntegrationCommands {
  private readonly access: SimHttpApiAccess;

  constructor(properties: SimHttpApiIntegrationCommandsProperties) {
    this.access = properties.access;
  }

  /**
   * Handle a CreateIntegration command.
   */
  createIntegration(
    command: SimCreateIntegrationCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimCreateIntegrationCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayV2UnsimulatedInput(
      "CreateIntegration",
    );
    unsimulated.refuseUnaccepted(input, acceptedCreateIntegrationOptions);
    const apiId = unsimulated.require("ApiId", input.ApiId);
    unsimulated.require("IntegrationType", input.IntegrationType);
    unsimulated.refuseUnless(
      "IntegrationType",
      input.IntegrationType,
      "AWS_PROXY",
      "only a Lambda proxy integration is simulated",
    );
    // Real API Gateway requires the payload format on an HTTP API rather than
    // defaulting it, so an integration that does not say is refused here too.
    unsimulated.require("PayloadFormatVersion", input.PayloadFormatVersion);
    unsimulated.refuseUnless(
      "PayloadFormatVersion",
      input.PayloadFormatVersion,
      simulatedPayloadFormatVersion,
      "payload format 1.0 builds a different event, and shaping one is not " +
        "simulated",
    );
    const integrationUri = unsimulated.require(
      "IntegrationUri",
      input.IntegrationUri,
    );

    const api = this.access.api({
      method: "POST",
      apiId,
      childPath: integrationsPath,
      caller: options?.caller,
    });

    const integration = new SimHttpApiIntegration({
      integrationId: api.integrations.allocateId(),
      integrationType: "AWS_PROXY",
      lambdaUri: SimHttpApiLambdaUri.parse(integrationUri),
      payloadFormatVersion: simulatedPayloadFormatVersion,
      description: input.Description,
    });
    api.integrations.add(integration);

    return { ...integration.view(), $metadata: {} };
  }

  /**
   * Handle a GetIntegrations command.
   */
  getIntegrations(
    command: SimGetIntegrationsCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetIntegrationsCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetIntegrations");
    unsimulated.refusePaging(command.input);
    unsimulated.refuseUnaccepted(command.input, ["ApiId"]);
    const apiId = unsimulated.require("ApiId", command.input.ApiId);

    const api = this.access.api({
      method: "GET",
      apiId,
      childPath: integrationsPath,
      caller: options?.caller,
    });

    return {
      Items: api.integrations.list().map((integration) => integration.view()),
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteIntegration command.
   *
   * An integration a route still points at is refused, which is what real API
   * Gateway does. The API says so, since the rule is about how its routes and
   * its integrations relate.
   */
  deleteIntegration(
    command: SimDeleteIntegrationCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimDeleteIntegrationCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput(
      "DeleteIntegration",
    );
    unsimulated.refuseUnaccepted(command.input, ["ApiId", "IntegrationId"]);
    const apiId = unsimulated.require("ApiId", command.input.ApiId);
    const integrationId = unsimulated.require(
      "IntegrationId",
      command.input.IntegrationId,
    );

    const api = this.access.api({
      method: "DELETE",
      apiId,
      childPath: `${integrationsPath}/${integrationId}`,
      caller: options?.caller,
    });
    const integration = api.integrations.find(integrationId);

    if (integration === undefined) {
      throw new SimApiGatewayV2NotFound(
        `No integration with id ${integrationId} on API ${apiId}`,
      );
    }

    api.assertIntegrationDeletable(integration.integrationId);
    api.integrations.remove(integration.integrationId);

    return { $metadata: {} };
  }
}
