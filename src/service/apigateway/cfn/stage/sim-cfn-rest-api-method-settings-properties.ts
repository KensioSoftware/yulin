import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimRestApiMethodSettings,
  SimRestApiMethodSettingsMap,
} from "../../api/stage/settings/sim-rest-api-method-settings.type.js";
import { SimCfnApiGatewayPropertyParser } from "../sim-cfn-api-gateway-property-parser.js";

/**
 * The properties of a stage's `MethodSettings` entries this simulation
 * deploys. The rest are caching, metrics and logging, so a template carrying
 * one has it recorded against the stage.
 */
const simulatedProperties = [
  "ResourcePath",
  "HttpMethod",
  "ThrottlingRateLimit",
  "ThrottlingBurstLimit",
];

interface SimCfnRestApiMethodSettingsPropertiesProperties {
  readonly resource: SimCfnResource;
}

/**
 * Reads the `MethodSettings` of an AWS::ApiGateway::Stage.
 *
 * A template writes a list, and each entry names the method it applies to with
 * `ResourcePath` and `HttpMethod`. CreateStage takes the same settings as a
 * map keyed `{resourcePath}/{httpMethod}`, which is what this builds.
 */
export class SimCfnRestApiMethodSettingsProperties {
  private readonly resource: SimCfnResource;
  private readonly parser = new SimCfnApiGatewayPropertyParser({
    resourceType: "AWS::ApiGateway::Stage MethodSettings",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnRestApiMethodSettingsPropertiesProperties) {
    this.resource = properties.resource;
  }

  /**
   * Read the `MethodSettings` list into the map CreateStage takes.
   */
  methodSettings(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): SimRestApiMethodSettingsMap | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw this.parser.invalidPropertyError(
        this.resource,
        label,
        "a list of method settings",
      );
    }

    return Object.fromEntries(
      value.map((entry, index) => this.entry(entry, `${label}[${index}]`)),
    );
  }

  /**
   * One entry of the list, as the key it applies to and what it sets there.
   *
   * Both halves of the key are required, as they are on real CloudFormation.
   * The stage default is the entry naming the resource path `/` with a star,
   * and the method as a star. A limit the template left out is left out here
   * too, and a stage reports the settings it was written with.
   */
  private entry(
    value: SimCfnTemplateValue,
    label: string,
  ): [string, SimRestApiMethodSettings] {
    const { resource, parser } = this;
    const record = parser.optionalRecord(resource, value, label) ?? {};

    parser.ignoreUnsimulated(resource, record, `${label}.`);

    const path = `${label}.`;
    const rate = parser.optionalNumber(
      resource,
      record["ThrottlingRateLimit"],
      `${path}ThrottlingRateLimit`,
    );
    const burst = parser.optionalNumber(
      resource,
      record["ThrottlingBurstLimit"],
      `${path}ThrottlingBurstLimit`,
    );
    const key = [
      parser.requiredString(
        resource,
        record["ResourcePath"],
        `${path}ResourcePath`,
      ),
      parser.requiredString(
        resource,
        record["HttpMethod"],
        `${path}HttpMethod`,
      ),
    ].join("/");

    return [
      key,
      {
        ...(rate !== undefined && { throttlingRateLimit: rate }),
        ...(burst !== undefined && { throttlingBurstLimit: burst }),
      },
    ];
  }
}
