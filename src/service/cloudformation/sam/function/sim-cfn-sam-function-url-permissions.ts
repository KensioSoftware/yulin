import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { samConditionAttribute } from "./sim-cfn-sam-function-properties.js";

/**
 * The permissions SAM writes for a `NONE` Function URL, under the logical IDs
 * SAM gives them.
 *
 * A Function URL takes `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction`
 * both, so SAM grants each to `*`, the second only for calls through the URL.
 */
export function samPublicUrlPermissions(
  logicalId: string,
  condition: SimCfnTemplateValue | undefined,
): Record<string, SimCfnTemplateValue> {
  const permission = (
    properties: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValue => ({
    Type: "AWS::Lambda::Permission",
    ...samConditionAttribute(condition),
    Properties: {
      FunctionName: { Ref: logicalId },
      Principal: "*",
      ...properties,
    },
  });

  return {
    [`${logicalId}UrlPublicPermissions`]: permission({
      Action: "lambda:InvokeFunctionUrl",
      FunctionUrlAuthType: "NONE",
    }),
    [`${logicalId}URLInvokeAllowPublicAccess`]: permission({
      Action: "lambda:InvokeFunction",
      InvokedViaFunctionUrl: true,
    }),
  };
}
