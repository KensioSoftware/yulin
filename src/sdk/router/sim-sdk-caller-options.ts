import type { SimAwsCaller } from "../../service/aws/caller/sim-aws-caller.js";
import type { SimSdkCommandContext } from "./sim-sdk-command-router.type.js";

/**
 * Simulated service request options carrying the resolved caller.
 *
 * Structurally compatible with each simulated service's own request options,
 * such as SimS3RequestOptions and SimDynamoDbRequestOptions.
 */
export interface SimSdkCallerOptions {
  readonly caller: SimAwsCaller;
}

/**
 * Build service request options from a routed Command's context, so service
 * routers can pass the resolved caller through to simulated operations in one
 * expression. Returns undefined when no caller applies, preserving each
 * operation's default-caller behaviour.
 */
export function simSdkCallerOptions(
  context: SimSdkCommandContext,
): SimSdkCallerOptions | undefined {
  return context.caller === undefined ? undefined : { caller: context.caller };
}
