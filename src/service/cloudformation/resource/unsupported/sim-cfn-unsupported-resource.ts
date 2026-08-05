/**
 * Whether an error says sim CloudFormation has no implementation for a
 * Resource, rather than that an implementation ran and failed.
 *
 * Service factories raise this as an ordinary error, because from the service's
 * point of view being asked for a Resource type it does not model is a refusal
 * like any other. The Stack lifecycle reads it differently: an unsupported
 * Resource is recorded and stepped over, so the rest of the Stack still
 * deploys, and still tears down.
 */
export function isSimCfnUnsupportedResourceError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Unsupported sim") &&
    error.message.includes("CloudFormation")
  );
}
