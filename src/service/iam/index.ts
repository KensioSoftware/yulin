export { SimIam } from "./sim-iam.js";
export type { SimIamRequestOptions } from "./command/sim-iam-request-options.js";
export type { SimIamCredentialIdentity } from "./credential/sim-aws-credentials.js";
export {
  SimIamExpiredToken,
  SimIamIncompleteSignature,
  SimIamInvalidClientTokenId,
  SimIamSignatureDoesNotMatch,
  SimIamSigV4Error,
  type SimIamSigV4ErrorCode,
} from "./sigv4/error/sim-iam-sigv4.error.js";
