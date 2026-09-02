import type * as simS3Commands from "./command/sim-s3-command.types.js";
import type { SimS3RequestOptions } from "./command/sim-s3-request-options.js";
import { SimS3VersionOperations } from "./sim-s3-version-operations.js";

/**
 * The AWS operations that hold tags against an Object.
 *
 * They sit together because real S3 grants each of them a permission of its
 * own, and none of them is reachable through the read and the write of the
 * Object they name.
 *
 * `SimS3Operations` extends this, and `SimS3` extends that, so a caller reaches
 * all of them on the one service object.
 */
export abstract class SimS3TaggingOperations extends SimS3VersionOperations {
  /** Handle a Put Object Tagging Command from the SDK. */
  async putObjectTagging(
    command: simS3Commands.SimPutObjectTaggingCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectTaggingCommandOutput> {
    return await this.commands.objectTagging.put(command, options);
  }

  /** Handle a Get Object Tagging Command from the SDK. */
  async getObjectTagging(
    command: simS3Commands.SimGetObjectTaggingCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetObjectTaggingCommandOutput> {
    return await this.commands.objectTagging.get(command, options);
  }

  /** Handle a Delete Object Tagging Command from the SDK. */
  async deleteObjectTagging(
    command: simS3Commands.SimDeleteObjectTaggingCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectTaggingCommandOutput> {
    return await this.commands.objectTagging.delete(command, options);
  }
}
