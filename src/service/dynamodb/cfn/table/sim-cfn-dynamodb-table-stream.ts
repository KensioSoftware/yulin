import type { SimDynamoDbStreamSpecification } from "../../stream/sim-dynamodb-stream.types.js";
import type { SimCfnDynamoDbTableValues } from "./sim-cfn-dynamodb-table-values.js";

/**
 * Read the stream an AWS::DynamoDB::Table Resource asks for.
 *
 * CloudFormation's StreamSpecification carries no `StreamEnabled`, where the
 * SDK's requires one, so declaring the property is how a template says it wants
 * a stream. `StreamEnabled` is synthesized from the property being there at
 * all, because passing the block straight through would make a table whose
 * stream was never switched on.
 *
 * The view type is passed through as the template wrote it, so a template
 * naming one that does not exist is refused in the words CreateTable refuses it
 * in.
 */
export function readSimCfnDynamoDbTableStream(
  values: SimCfnDynamoDbTableValues,
): SimDynamoDbStreamSpecification | undefined {
  const specification = values.object("StreamSpecification");

  if (specification === undefined) {
    return undefined;
  }

  return {
    StreamEnabled: true,
    StreamViewType: specification.string("StreamViewType"),
  };
}
