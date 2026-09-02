import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";
import { samConditionAttribute } from "./sim-cfn-sam-function-properties.js";

interface SamFunctionUrlProperties {
  readonly logicalId: string;
  readonly functionProperties: SimCfnTemplateValueRecord;
  readonly condition: SimCfnTemplateValue | undefined;
}

/**
 * The `FunctionUrlConfig` properties the AWS::Lambda::Url carries over.
 */
const carriedNames = new Set(["AuthType", "InvokeMode", "Cors"]);

/**
 * The AWS::Lambda::Url a function's `FunctionUrlConfig` is expanded into.
 *
 * The URL is named after the function, as SAM names it, so a template reading
 * `Fn::GetAtt` on `RatesUrl` for a function called `Rates` gets the endpoint.
 *
 * `AuthType` goes over as it came rather than being defaulted, so a config
 * stating none is refused by the Resource it expands into rather than quietly
 * served to anyone.
 */
export function samFunctionUrlResources(
  properties: SamFunctionUrlProperties,
): Record<string, SimCfnTemplateValue> {
  const { logicalId, functionProperties, condition } = properties;
  const config = functionProperties["FunctionUrlConfig"];

  if (!isSamTemplateRecord(config)) {
    return {};
  }

  return {
    [`${logicalId}Url`]: {
      Type: "AWS::Lambda::Url",
      ...samConditionAttribute(condition),
      Properties: {
        TargetFunctionArn: { "Fn::GetAtt": [logicalId, "Arn"] },
        ...Object.fromEntries(
          Object.entries(config).filter(([name]) => carriedNames.has(name)),
        ),
      },
    },
  };
}
