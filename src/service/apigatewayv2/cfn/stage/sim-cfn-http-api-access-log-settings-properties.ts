import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApiAccessLogSettingsInput } from "../../api/stage/access-log/sim-http-api-access-log-settings.type.js";
import type { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

interface SimCfnHttpApiAccessLogSettingsPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnApiGatewayV2PropertyParser;
}

/**
 * Reads the `AccessLogSettings` of an AWS::ApiGatewayV2::Stage.
 *
 * `DestinationArn` reaches the template as a `Fn::GetAtt` on the log group's
 * `Arn`, which CDK emits and which resolves to the form ending in `:*`. The
 * form without it, as `DescribeLogGroups` reports, names the same group.
 */
export class SimCfnHttpApiAccessLogSettingsProperties {
  readonly #resource: SimCfnResource;
  readonly #propertyParser: SimCfnApiGatewayV2PropertyParser;

  constructor(properties: SimCfnHttpApiAccessLogSettingsPropertiesProperties) {
    this.#resource = properties.resource;
    this.#propertyParser = properties.propertyParser;
  }

  /**
   * Read the `AccessLogSettings` a stage was declared with.
   */
  settings(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): SimHttpApiAccessLogSettingsInput | undefined {
    const record = this.#propertyParser.optionalRecord(
      this.#resource,
      value,
      label,
    );

    if (record === undefined) {
      return undefined;
    }

    const destinationArn = this.#propertyParser.optionalString(
      this.#resource,
      record["DestinationArn"],
      `${label}.DestinationArn`,
    );
    const format = this.#propertyParser.optionalString(
      this.#resource,
      record["Format"],
      `${label}.Format`,
    );

    return {
      ...(destinationArn !== undefined && { DestinationArn: destinationArn }),
      ...(format !== undefined && { Format: format }),
    };
  }
}
