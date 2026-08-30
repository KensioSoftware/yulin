import type * as simS3Commands from "./command/sim-s3-command.types.js";
import type { SimS3RequestOptions } from "./command/sim-s3-request-options.js";
import type { SimS3Commands } from "./sim-s3-commands.js";

/**
 * The AWS operations that make a Bucket keep what it held.
 *
 * Versioning is what a Bucket keeps its history in, and Object Lock is what
 * stops anything taking that history away. Object Lock refuses a Bucket
 * without versioning underneath it, so the two are one subject and sit
 * together.
 *
 * `SimS3Operations` extends this, and `SimS3` extends that, so a caller
 * reaches all of them on the one service object.
 */
export abstract class SimS3VersionOperations {
  protected constructor(protected readonly commands: SimS3Commands) {}

  /** Handle a Put Bucket Versioning Command from the SDK. */
  async putBucketVersioning(
    command: simS3Commands.SimPutBucketVersioningCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketVersioningCommandOutput> {
    return await this.commands.versioning.put(command, options);
  }

  /** Handle a Get Bucket Versioning Command from the SDK. */
  async getBucketVersioning(
    command: simS3Commands.SimGetBucketVersioningCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketVersioningCommandOutput> {
    return await this.commands.versioning.get(command, options);
  }

  /** Handle a List Object Versions Command from the SDK. */
  async listObjectVersions(
    command: simS3Commands.SimListObjectVersionsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectVersionsCommandOutput> {
    return await this.commands.versioning.list(command, options);
  }

  /** Handle a Put Object Lock Configuration Command from the SDK. */
  async putObjectLockConfiguration(
    command: simS3Commands.SimPutObjectLockConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectLockConfigurationCommandOutput> {
    return await this.commands.objectLock.putConfiguration(command, options);
  }

  /** Handle a Get Object Lock Configuration Command from the SDK. */
  async getObjectLockConfiguration(
    command: simS3Commands.SimGetObjectLockConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetObjectLockConfigurationCommandOutput> {
    return await this.commands.objectLock.getConfiguration(command, options);
  }

  /** Handle a Put Object Retention Command from the SDK. */
  async putObjectRetention(
    command: simS3Commands.SimPutObjectRetentionCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectRetentionCommandOutput> {
    return await this.commands.objectLock.putRetention(command, options);
  }

  /** Handle a Put Object Legal Hold Command from the SDK. */
  async putObjectLegalHold(
    command: simS3Commands.SimPutObjectLegalHoldCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectLegalHoldCommandOutput> {
    return await this.commands.objectLock.putLegalHold(command, options);
  }
}
