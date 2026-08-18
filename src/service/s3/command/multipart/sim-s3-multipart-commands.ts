import { AbortMultipartUploadCommandHandler } from "../abort-multipart-upload/abort-multipart-upload.handler.js";
import { CompleteMultipartUploadCommandHandler } from "../complete-multipart-upload/complete-multipart-upload.handler.js";
import { CreateMultipartUploadCommandHandler } from "../create-multipart-upload/create-multipart-upload.handler.js";
import { ListMultipartUploadsCommandHandler } from "../list-multipart-uploads/list-multipart-uploads.handler.js";
import { ListPartsCommandHandler } from "../list-parts/list-parts.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { UploadPartCommandHandler } from "../upload-part/upload-part.handler.js";

/**
 * The multipart upload commands of one simulated S3 scope.
 */
export class SimS3MultipartCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Start an upload and issue the id its parts are sent under.
   */
  async create(
    command: simS3Commands.SimCreateMultipartUploadCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimCreateMultipartUploadCommandOutput> {
    return await new CreateMultipartUploadCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Store one numbered part of an upload.
   */
  async uploadPart(
    command: simS3Commands.SimUploadPartCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimUploadPartCommandOutput> {
    return await new UploadPartCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Join the parts of an upload into one stored Object.
   */
  async complete(
    command: simS3Commands.SimCompleteMultipartUploadCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimCompleteMultipartUploadCommandOutput> {
    return await new CompleteMultipartUploadCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Give up on an upload, discarding its parts.
   */
  async abort(
    command: simS3Commands.SimAbortMultipartUploadCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimAbortMultipartUploadCommandOutput> {
    return await new AbortMultipartUploadCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * List the uploads a Bucket has in progress.
   */
  async list(
    command: simS3Commands.SimListMultipartUploadsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListMultipartUploadsCommandOutput> {
    return await new ListMultipartUploadsCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * List the parts stored against one upload.
   */
  async listParts(
    command: simS3Commands.SimListPartsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListPartsCommandOutput> {
    return await new ListPartsCommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
