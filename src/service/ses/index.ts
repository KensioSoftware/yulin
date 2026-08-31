export { SimSesV2 } from "./sim-ses-v2.js";
export type { SimSesV2Properties } from "./sim-ses-commands.js";
export type { SimSesRequestOptions } from "./command/sim-ses-request-options.js";
export type {
  SimSesServiceSendRequest,
  SimSesServiceSendResult,
} from "./command/send/sim-ses-service-send.js";
export {
  SimSesIdentity,
  type SimSesDkimStatus,
  type SimSesVerificationStatus,
} from "./identity/sim-ses-identity.js";
export {
  defaultSimSesIdentitySettings,
  type SimSesDkimSettings,
  type SimSesDkimSigningOrigin,
  type SimSesIdentitySettings,
  type SimSesIdentityTag,
  type SimSesMailFromBehaviour,
  type SimSesMailFromSettings,
} from "./identity/sim-ses-identity-settings.js";
export { SimSesIdentityStore } from "./identity/sim-ses-identity-store.js";
export {
  requiredSimSesIdentityName,
  simSesIdentityDomain,
  simSesIdentityKey,
  type SimSesIdentityType,
  simSesIdentityType,
} from "./identity/sim-ses-identity-name.js";
export {
  simSesArnPrefix,
  simSesConfigurationSetArn,
  simSesIdentityArn,
} from "./sim-ses-arn.js";
export {
  SimSesConfigurationSet,
  type SimSesConfigurationSetDeliveryOptions,
  type SimSesConfigurationSetOptions,
  type SimSesConfigurationSetReputationOptions,
  type SimSesSuppressedReason,
} from "./configuration-set/sim-ses-configuration-set.js";
export { SimSesConfigurationSetStore } from "./configuration-set/sim-ses-configuration-set-store.js";
export {
  SimSesSentEmail,
  type SimSesSentEmailAttachment,
  type SimSesSentEmailBody,
  type SimSesSentEmailDestination,
  type SimSesSuppressedRecipient,
} from "./email/sim-ses-sent-email.js";
export { SimSesSentEmailStore } from "./email/sim-ses-sent-email-store.js";
export {
  requiredSimSesFromAddress,
  simSesBareAddress,
} from "./email/sim-ses-address.js";
export { SimSesSuppressedDestination } from "./suppression/sim-ses-suppressed-destination.js";
export { SimSesSuppressionList } from "./suppression/sim-ses-suppression-list.js";
export {
  requiredSimSesSuppressionReason,
  type SimSesSuppressionReason,
} from "./suppression/sim-ses-suppression-reason.js";
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
  SimSesSendingPausedException,
  SimSesUnsupportedOperationException,
} from "./error/sim-ses.error.js";
