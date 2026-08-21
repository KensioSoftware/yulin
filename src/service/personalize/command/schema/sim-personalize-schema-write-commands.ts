import { SimPersonalizeInvalidInputException } from "../../error/sim-personalize.error.js";
import { simPersonalizeSchemaArn } from "../../resource/sim-personalize-arn.js";
import { requireSchemaUnused } from "../../resource/sim-personalize-in-use.js";
import { readSimPersonalizeDomain } from "../../resource/sim-personalize-domain.js";
import { requireSimPersonalizeName } from "../../resource/sim-personalize-name.js";
import { SimPersonalizeSchema } from "../../resource/sim-personalize-schema.js";
import { simPersonalizeActiveStatus } from "../../resource/sim-personalize-status.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimCreateSchemaCommand,
  SimCreateSchemaCommandOutput,
  SimDeleteSchemaCommand,
  SimDeleteSchemaCommandOutput,
} from "./schema.command.js";

/**
 * The simulated Personalize schema commands that change state.
 */
export class SimPersonalizeSchemaWriteCommands extends SimPersonalizeCommandGroup {
  /**
   * Handle a CreateSchema command.
   *
   * The Avro document is held as the string it arrived as. Simulated
   * Personalize reads no dataset, and the fields it declares go unused.
   */
  create(
    command: SimCreateSchemaCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimCreateSchemaCommandOutput {
    this.authorizer.authorize("personalize:CreateSchema", options);

    const { input } = command;
    const name = requireSimPersonalizeName(input.name, "schema");
    const domain = readSimPersonalizeDomain(input.domain);

    if (input.schema === undefined || input.schema === "") {
      throw new SimPersonalizeInvalidInputException(
        "A schema needs a schema document",
      );
    }

    this.resources.schemas.requireNameAvailable(name);

    const schema = new SimPersonalizeSchema({
      arn: simPersonalizeSchemaArn(name, this.accountRegionScope),
      name,
      status: simPersonalizeActiveStatus,
      creationDateTime: this.clock.now(),
      schema: input.schema,
      domain,
    });

    this.resources.schemas.add(schema);

    return { schemaArn: schema.arn, $metadata: {} };
  }

  /**
   * Handle a DeleteSchema command.
   *
   * Real Personalize refuses a schema a dataset is still associated with.
   */
  delete(
    command: SimDeleteSchemaCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDeleteSchemaCommandOutput {
    const schema = this.resolve(
      this.resources.schemas,
      command.input.schemaArn,
      "personalize:DeleteSchema",
      options,
    );
    requireSchemaUnused(this.resources, schema.arn);
    this.resources.schemas.remove(schema);

    return { $metadata: {} };
  }
}
