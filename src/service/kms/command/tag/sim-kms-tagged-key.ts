import {
  SimKmsInvalidStateException,
  SimKmsNotFoundException,
} from "../../error/sim-kms.error.js";
import { SimKmsKeyState, type SimKmsKey } from "../../key/sim-kms-key.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type { SimKmsRequestOptions } from "../sim-kms-request-options.js";

/**
 * Where a tag command finds its key and authorizes against it.
 */
export interface SimKmsTagScope {
  readonly keys: SimKmsKeyStore;
  readonly authorizer: SimKmsAuthorizer;
}

/**
 * The key a tag command names by key ID or key ARN, once the caller is
 * allowed the action on it. An alias names neither, and is refused. A key
 * pending deletion is refused as well where the request would change its
 * tags.
 */
export function simKmsTaggedKey(
  scope: SimKmsTagScope,
  action: string,
  keyId: string | undefined,
  options: SimKmsRequestOptions | undefined,
  changing: boolean,
): SimKmsKey {
  if (keyId?.includes("alias/") === true) {
    throw new SimKmsNotFoundException(
      `Invalid keyId ${keyId}. The tag commands take a key ID or key ARN, ` +
        "and an alias names neither.",
    );
  }

  const key = scope.keys.require(keyId);

  scope.authorizer.authorizeKey(action, key, options);

  if (changing && key.keyState === SimKmsKeyState.PendingDeletion) {
    throw new SimKmsInvalidStateException(
      `${key.arn} is pending deletion, and its tags cannot change.`,
    );
  }

  return key;
}
