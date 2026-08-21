import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import { simPersonalizePageOf } from "../list/sim-personalize-page.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import { simPersonalizeSchemaView } from "../../view/sim-personalize-schema-view.js";
import type {
  SimDescribeSchemaCommand,
  SimDescribeSchemaCommandOutput,
  SimListSchemasCommand,
  SimListSchemasCommandOutput,
} from "./schema.command.js";

/**
 * The simulated Personalize schema commands that only read.
 */
export class SimPersonalizeSchemaReadCommands extends SimPersonalizeCommandGroup {
  /** Handle a DescribeSchema command. */
  describe(
    command: SimDescribeSchemaCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDescribeSchemaCommandOutput {
    const schema = this.resolve(
      this.resources.schemas,
      command.input.schemaArn,
      "personalize:DescribeSchema",
      options,
    );

    return { schema: simPersonalizeSchemaView(schema), $metadata: {} };
  }

  /** Handle a ListSchemas command. */
  list(
    command: SimListSchemasCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimListSchemasCommandOutput {
    this.authorizer.authorize("personalize:ListSchemas", options);

    const page = simPersonalizePageOf(
      this.resources.schemas.all,
      command.input,
    );

    return {
      schemas: page.items.map((schema) => simPersonalizeSchemaView(schema)),
      nextToken: page.nextToken,
      $metadata: {},
    };
  }
}
