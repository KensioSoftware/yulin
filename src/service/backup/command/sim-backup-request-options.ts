import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

export interface SimBackupRequestOptions {
  readonly caller?: SimAwsCaller | undefined;
}
