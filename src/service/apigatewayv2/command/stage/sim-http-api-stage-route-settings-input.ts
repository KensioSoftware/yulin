import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimHttpApiStageRouteSettings } from "../../api/stage/settings/sim-http-api-stage-route-settings.js";
import type { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimCreateStageCommandInput } from "./stage.command.js";

/**
 * The route settings members this simulation acts on. `DetailedMetricsEnabled`,
 * `LoggingLevel` and `DataTraceEnabled` are metrics and logging rather than
 * throttling, and nothing here reads any of them.
 */
const acceptedRouteSettings = ["ThrottlingRateLimit", "ThrottlingBurstLimit"];

interface SimHttpApiStageRouteSettingsInputProperties {
  readonly unsimulated: SimApiGatewayV2UnsimulatedInput;
  readonly clock: SimClock;
}

/**
 * Reads the throttling a CreateStage input asks for.
 *
 * Both `DefaultRouteSettings` and every entry of `RouteSettings` are checked
 * member by member. A stage asking for logging is refused by the member that
 * asks for it.
 */
export function simHttpApiStageRouteSettings(
  input: SimCreateStageCommandInput,
  properties: SimHttpApiStageRouteSettingsInputProperties,
): SimHttpApiStageRouteSettings | undefined {
  const { DefaultRouteSettings: defaults, RouteSettings: byRouteKey } = input;
  const { unsimulated } = properties;

  unsimulated.refuseUnaccepted(
    defaults ?? {},
    acceptedRouteSettings,
    "DefaultRouteSettings.",
  );

  const perRoute = Object.entries(byRouteKey ?? {});

  for (const [routeKey, settings] of perRoute) {
    unsimulated.refuseUnaccepted(
      settings,
      acceptedRouteSettings,
      `RouteSettings '${routeKey}' `,
    );
  }

  if (defaults === undefined && byRouteKey === undefined) {
    return undefined;
  }

  return new SimHttpApiStageRouteSettings({
    clock: properties.clock,
    defaultRouteSettings: defaults,
    routeSettings: byRouteKey,
  });
}
