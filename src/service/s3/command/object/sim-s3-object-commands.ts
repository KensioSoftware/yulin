import { DeleteObjectCommandHandler } from "../delete-object/delete-object.handler.js";
import { DeleteObjectsCommandHandler } from "../delete-objects/delete-objects.handler.js";
import { GetObjectCommandHandler } from "../get-object/get-object.handler.js";
import { HeadObjectCommandHandler } from "../head-object/head-object.handler.js";
import { ListObjectsCommandHandler } from "../list-objects/list-objects.handler.js";
import { ListObjectsV2CommandHandler } from "../list-objects-v2/list-objects-v2.handler.js";
import { PutObjectCommandHandler } from "../put-object/put-object.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The Object commands of one simulated S3 scope.
 */
export class SimS3ObjectCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Change how many keys one page of a listing holds.
   */
  configureMaxKeysPerPage(maxKeys: number): void {
    this.state.listing.configureMaxKeysPerPage(maxKeys);
  }

  /**
   * Store an Object in a Bucket.
   */
  async put(
    command: simS3Commands.SimPutObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectCommandOutput> {
    return await new PutObjectCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Read an Object from a Bucket.
   */
  async get(
    command: simS3Commands.SimGetObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetObjectCommandOutput> {
    return await new GetObjectCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Report what a read of an Object would say about it, without the Object.
   */
  async head(
    command: simS3Commands.SimHeadObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimHeadObjectCommandOutput> {
    return await new HeadObjectCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Remove an Object from a Bucket.
   */
  async delete(
    command: simS3Commands.SimDeleteObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectCommandOutput> {
    return await new DeleteObjectCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Remove several Objects from a Bucket in one request.
   */
  async deleteMany(
    command: simS3Commands.SimDeleteObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectsCommandOutput> {
    return await new DeleteObjectsCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * List the Objects in a Bucket.
   */
  async list(
    command: simS3Commands.SimListObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectsCommandOutput> {
    return await new ListObjectsCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * List the Objects in a Bucket, the way current tooling asks.
   */
  async listV2(
    command: simS3Commands.SimListObjectsV2Command,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectsV2CommandOutput> {
    return await new ListObjectsV2CommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
