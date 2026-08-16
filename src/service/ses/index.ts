export { SimSesV2 } from "./sim-ses-v2.js";
export type { SimSesV2Properties } from "./sim-ses-commands.js";
export type { SimSesRequestOptions } from "./command/sim-ses-request-options.js";
export {
  SimSesIdentity,
  type SimSesVerificationStatus,
} from "./identity/sim-ses-identity.js";
export { SimSesIdentityStore } from "./identity/sim-ses-identity-store.js";
export {
  requiredSimSesIdentityName,
  simSesIdentityDomain,
  simSesIdentityKey,
  type SimSesIdentityType,
  simSesIdentityType,
} from "./identity/sim-ses-identity-name.js";
export { simSesArnPrefix, simSesIdentityArn } from "./identity/sim-ses-arn.js";
export {
  SimSesSentEmail,
  type SimSesSentEmailBody,
  type SimSesSentEmailDestination,
} from "./email/sim-ses-sent-email.js";
export { SimSesSentEmailStore } from "./email/sim-ses-sent-email-store.js";
export {
  requiredSimSesFromAddress,
  simSesBareAddress,
} from "./email/sim-ses-address.js";
export {
  SimSesAccount,
  type SimSesAccountContactDetails,
  type SimSesSendQuota,
} from "./account/sim-ses-account.js";
export {
  SimSesAlreadyExistsException,
  SimSesBadRequestException,
  SimSesError,
  type SimSesErrorMetadata,
  SimSesMessageRejected,
  SimSesNotFoundException,
  SimSesUnsupportedOperationException,
} from "./error/sim-ses.error.js";
