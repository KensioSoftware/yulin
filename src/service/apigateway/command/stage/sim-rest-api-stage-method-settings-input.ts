import type { SimRestApiMethodSettingsMap } from "../../api/stage/settings/sim-rest-api-method-settings.type.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimCreateStageCommandInput } from "./stage.command.js";

/**
 * The method setting members this simulation acts on. `cachingEnabled`,
 * `metricsEnabled`, `loggingLevel` and `dataTraceEnabled` are caching, metrics
 * and logging, and nothing here reads any of them.
 */
const acceptedMethodSettings = ["throttlingRateLimit", "throttlingBurstLimit"];

/**
 * Read the throttling a CreateStage input asks for.
 *
 * An entry is keyed `{resourcePath}/{httpMethod}`, which is how API Gateway
 * keys the settings it reports, and the entry keyed with two stars is the
 * stage default. Real CreateStage carries no method settings at all. AWS takes
 * them through UpdateStage patch operations, which are outside this
 * simulation, and through the `MethodSettings` of an AWS::ApiGateway::Stage.
 * This input is here so that a test can throttle a stage without a template.
 *
 * Every entry is checked member by member. A stage asking for request logging
 * is refused by the member that asks for it.
 */
export function simRestApiStageMethodSettings(
  input: SimCreateStageCommandInput,
  unsimulated: SimApiGatewayUnsimulatedInput,
): SimRestApiMethodSettingsMap | undefined {
  const { methodSettings } = input;
  const perMethod = Object.entries(methodSettings ?? {});

  for (const [key, settings] of perMethod) {
    requireMethodKey(key);
    unsimulated.refuseUnaccepted(
      settings,
      acceptedMethodSettings,
      `methodSettings '${key}' `,
    );
  }

  return methodSettings;
}

/**
 * Refuse a key that is not a resource path followed by an HTTP method.
 */
function requireMethodKey(key: string): void {
  if (key.startsWith("/") && key.lastIndexOf("/") > 0) {
    return;
  }

  throw new SimApiGatewayBadRequest(
    `CreateStage methodSettings key '${key}' is not a method: a key is a ` +
      `resource path and an HTTP method, such as '/orders/GET', and the ` +
      `stage default is the resource path '/*' and the method '*' joined ` +
      `the same way`,
  );
}
