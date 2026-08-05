/**
 * The command types of every simulated KMS operation, in one place.
 *
 * The SimKms facade handles all of them, so gathering the types here keeps it
 * a delegation rather than a page of imports.
 */
export type {
  SimCreateAliasCommand,
  SimCreateAliasCommandOutput,
  SimDeleteAliasCommand,
  SimDeleteAliasCommandOutput,
  SimListAliasesCommand,
  SimListAliasesCommandOutput,
} from "./alias/alias.command.js";

export type {
  SimDecryptCommand,
  SimDecryptCommandOutput,
  SimEncryptCommand,
  SimEncryptCommandOutput,
  SimGenerateDataKeyCommand,
  SimGenerateDataKeyCommandOutput,
} from "./crypto/crypto.command.js";

export type {
  SimCancelKeyDeletionCommand,
  SimCancelKeyDeletionCommandOutput,
  SimCreateKeyCommand,
  SimCreateKeyCommandOutput,
  SimDescribeKeyCommand,
  SimDescribeKeyCommandOutput,
  SimDisableKeyCommand,
  SimDisableKeyCommandOutput,
  SimEnableKeyCommand,
  SimEnableKeyCommandOutput,
  SimGetKeyPolicyCommand,
  SimGetKeyPolicyCommandOutput,
  SimListKeysCommand,
  SimListKeysCommandOutput,
  SimPutKeyPolicyCommand,
  SimPutKeyPolicyCommandOutput,
  SimScheduleKeyDeletionCommand,
  SimScheduleKeyDeletionCommandOutput,
} from "./key/key.command.js";
