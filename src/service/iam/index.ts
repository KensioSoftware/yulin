export { SimIam } from "./sim-iam.js";
export type { SimIamRequestOptions } from "./command/sim-iam-request-options.js";
export type { SimIamCredentialIdentity } from "./credential/sim-aws-credentials.js";
export {
  SimIamCredentialScopeMismatch,
  SimIamExpiredToken,
  SimIamIncompleteSignature,
  SimIamInvalidClientTokenId,
  SimIamSignatureDoesNotMatch,
  SimIamSigV4Error,
  type SimIamSigV4ErrorCode,
} from "./sigv4/error/sim-iam-sigv4.error.js";
export type { SimIamSigV4ExpectedScope } from "./sigv4/sim-iam-sigv4-expected-scope.js";
export {
  simAwsCallerHeaderName,
  simAwsCallerHeaderPrincipal,
  simAwsCallerHeaderValue,
} from "./request/sim-aws-caller-header.js";
export {
  type SimAwsRequestAuthMethod,
  SimAwsRequestCaller,
} from "./request/sim-aws-request-caller.js";
export {
  isSimAwsRequestAuthFailure,
  SimAwsInvalidCallerHeader,
  type SimAwsRequestAuthFailure,
} from "./request/error/sim-aws-request-auth.error.js";
