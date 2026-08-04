import type { SimDynamoDbTimeToLiveSpecificationInput } from "../../command/time-to-live/time-to-live.types.js";
import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";

/**
 * Read the time to live an AWS::DynamoDB::Table Resource asks for.
 *
 * A CDK table with `timeToLiveAttribute` set emits this, so it is the ordinary
 * way a deployed table comes to expire items. The values go through
 * UpdateTimeToLive rather than being applied here, so a template naming no
 * attribute is refused in the same words an SDK caller would get.
 */
export function readSimCfnDynamoDbTableTimeToLive(
  values: SimCfnDynamoDbPropertyValues,
): SimDynamoDbTimeToLiveSpecificationInput | undefined {
  const specification = values.object("TimeToLiveSpecification");

  if (specification === undefined) {
    return undefined;
  }

  return {
    AttributeName: specification.string("AttributeName"),
    Enabled: specification.boolean("Enabled"),
  };
}
