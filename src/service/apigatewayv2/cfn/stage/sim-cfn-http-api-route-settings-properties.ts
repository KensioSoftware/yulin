import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimHttpApiRouteSettings,
  SimHttpApiRouteSettingsMap,
} from "../../api/stage/settings/sim-http-api-route-settings.type.js";
import type { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

/**
 * The route settings members this simulation deploys. The rest are metrics and
 * logging, and are recorded against the Resource rather than acted on.
 */
const simulatedMembers = ["ThrottlingRateLimit", "ThrottlingBurstLimit"];

interface SimCfnHttpApiRouteSettingsPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnApiGatewayV2PropertyParser;
}

/**
 * Reads the route settings of an AWS::ApiGatewayV2::Stage.
 *
 * `DefaultRouteSettings` is one of these and `RouteSettings` is a map of them
 * keyed by route key. A member outside the throttling pair is recorded by the
 * path it was written at. The stage still deploys, and the record says which
 * entry of the template it deployed without.
 */
export class SimCfnHttpApiRouteSettingsProperties {
  readonly #resource: SimCfnResource;
  readonly #propertyParser: SimCfnApiGatewayV2PropertyParser;

  constructor(properties: SimCfnHttpApiRouteSettingsPropertiesProperties) {
    this.#resource = properties.resource;
    this.#propertyParser = properties.propertyParser;
  }

  /**
   * Read one route settings object, such as `DefaultRouteSettings`.
   */
  settings(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): SimHttpApiRouteSettings | undefined {
    const record = this.#propertyParser.optionalRecord(
      this.#resource,
      value,
      label,
    );

    if (record === undefined) {
      return undefined;
    }

    this.#recordUnsimulated(record, label);

    const rate = this.#limit(record["ThrottlingRateLimit"], label, "Rate");
    const burst = this.#limit(record["ThrottlingBurstLimit"], label, "Burst");

    // A limit the template left out is left out here too. A stage reports the
    // settings it was written with.
    return {
      ...(rate !== undefined && { ThrottlingRateLimit: rate }),
      ...(burst !== undefined && { ThrottlingBurstLimit: burst }),
    };
  }

  /**
   * Read the `RouteSettings` map, keyed by the route key each entry throttles.
   */
  settingsMap(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): SimHttpApiRouteSettingsMap | undefined {
    const record = this.#propertyParser.optionalRecord(
      this.#resource,
      value,
      label,
    );

    if (record === undefined) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(record).map(([routeKey, settings]) => [
        routeKey,
        this.settings(settings, `${label}.${routeKey}`) ?? {},
      ]),
    );
  }

  #limit(
    value: SimCfnTemplateValue | undefined,
    label: string,
    limit: string,
  ): number | undefined {
    return this.#propertyParser.optionalNumber(
      this.#resource,
      value,
      `${label}.Throttling${limit}Limit`,
    );
  }

  #recordUnsimulated(
    record: Readonly<Record<string, SimCfnTemplateValue>>,
    label: string,
  ): void {
    for (const member of Object.keys(record)) {
      if (simulatedMembers.includes(member)) {
        continue;
      }

      this.#resource.ignoreProperty(
        `${label}.${member}`,
        `AWS::ApiGatewayV2::Stage route setting ${member} is not simulated, ` +
          `so the stage is created without it and behaves differently here ` +
          `than on AWS. The simulated route settings are ` +
          `${simulatedMembers.join(", ")}.`,
      );
    }
  }
}
