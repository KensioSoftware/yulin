import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The per-request options every simulated S3 command accepts.
 *
 * This lives beside the commands rather than on the service facade so a command
 * area can name it without importing the facade back.
 */
export interface SimS3RequestOptions {
  readonly caller?: SimAwsCaller;
}
