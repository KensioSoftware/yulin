import type { SimKinesisRequestOptions } from "../sim-kinesis-request-options.js";
import type { SimKinesisStreamAccess } from "../sim-kinesis-stream-access.js";
import type { SimCreateStreamCommandInput } from "./stream.command.js";

/**
 * Ensure the caller may create a stream, and tag it where the request carries
 * at least one tag.
 *
 * Tagging on create takes `kinesis:AddTagsToStream`. The Kinesis developer
 * guide says so, and says `kinesis:TagResource` does not count. The Service
 * Authorization Reference lists `aws:RequestTag` and `aws:TagKeys` for
 * neither action, so neither carries them here.
 */
export function simKinesisAuthorizeCreateStream(
  access: SimKinesisStreamAccess,
  name: string,
  input: SimCreateStreamCommandInput,
  options: SimKinesisRequestOptions | undefined,
): void {
  access.authorizeName("kinesis:CreateStream", name, options);

  if (Object.keys(input.Tags ?? {}).length > 0) {
    access.authorizeName("kinesis:AddTagsToStream", name, options);
  }
}
