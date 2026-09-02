import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaFunctionUrlCors } from "../../function/url/sim-lambda-function-url-cors.js";
import type { SimCfnLambdaPropertyParser } from "../function/sim-cfn-lambda-property-parser.js";

interface SimCfnLambdaUrlCorsProperties {
  readonly parser: SimCfnLambdaPropertyParser;
  readonly resource: SimCfnResource;
  readonly value: SimCfnTemplateValue | undefined;
}

/**
 * Read the `Cors` block of an `AWS::Lambda::Url` Resource.
 *
 * The members go to `CreateFunctionUrlConfig` as they are written. The bounds
 * Lambda puts on them are applied there, once. This reader settles only the
 * template question, whether each property is the shape CloudFormation says it
 * is.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-lambda-url-cors.html
 */
export function simCfnLambdaUrlCors(
  properties: SimCfnLambdaUrlCorsProperties,
): SimLambdaFunctionUrlCors | undefined {
  const { parser, resource, value } = properties;

  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw parser.invalidPropertyError(resource, "Cors", "an object");
  }

  const cors = value as Record<string, SimCfnTemplateValue | undefined>;

  // A member the template said nothing about is left out. What the Lambda API
  // reports back is then what the template wrote.
  return withoutAbsentMembers({
    AllowCredentials: parser.optionalBoolean(
      resource,
      cors["AllowCredentials"],
      "Cors.AllowCredentials",
    ),
    AllowHeaders: parser.optionalStringList(
      resource,
      cors["AllowHeaders"],
      "Cors.AllowHeaders",
    ),
    AllowMethods: parser.optionalStringList(
      resource,
      cors["AllowMethods"],
      "Cors.AllowMethods",
    ),
    AllowOrigins: parser.optionalStringList(
      resource,
      cors["AllowOrigins"],
      "Cors.AllowOrigins",
    ),
    ExposeHeaders: parser.optionalStringList(
      resource,
      cors["ExposeHeaders"],
      "Cors.ExposeHeaders",
    ),
    MaxAge: parser.optionalNumber(resource, cors["MaxAge"], "Cors.MaxAge"),
  });
}

/**
 * Drop the members the template did not state.
 */
function withoutAbsentMembers(
  cors: SimLambdaFunctionUrlCors,
): SimLambdaFunctionUrlCors {
  return Object.fromEntries(
    Object.entries(cors).filter(([, member]) => member !== undefined),
  );
}
