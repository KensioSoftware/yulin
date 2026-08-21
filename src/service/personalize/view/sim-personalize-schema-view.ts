import type { SimPersonalizeSchemaDetail } from "../command/schema/schema.command.js";
import type { SimPersonalizeSchema } from "../resource/sim-personalize-schema.js";

/**
 * A schema as the API reports it.
 *
 * Describe and List report the same fields for a schema, which is why there is
 * one view here where the other resources have two.
 */
export function simPersonalizeSchemaView(
  schema: SimPersonalizeSchema,
): SimPersonalizeSchemaDetail {
  return {
    name: schema.name,
    schemaArn: schema.arn,
    schema: schema.schema,
    creationDateTime: schema.creationDateTime,
    lastUpdatedDateTime: schema.lastUpdatedDateTime,
    domain: schema.domain,
  };
}
