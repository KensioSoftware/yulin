import type { SimIamAccessKeyStatus } from "../sim-iam-access-key.js";

/**
 * Base error for simulated IAM credential operations.
 */
export class SimIamCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type SimIamInvalidCredentialsReason =
  | "unknown-access-key"
  | "inactive-access-key"
  | "secret-access-key-mismatch"
  | "session-token-missing"
  | "session-token-unexpected"
  | "session-token-mismatch"
  | "expired-session";

interface SimIamInvalidCredentialsProperties {
  readonly accessKeyId: string;
  readonly reason: SimIamInvalidCredentialsReason;
  readonly accessKeyStatus?: SimIamAccessKeyStatus | undefined;
  readonly expiration?: Date | undefined;
}

/**
 * Raised when supplied simulated credentials cannot be authenticated.
 *
 * Diagnostic details identify the failed credential component without exposing
 * secret access keys or session tokens.
 */
export class SimIamInvalidCredentials extends SimIamCredentialError {
  public readonly accessKeyId: string;
  public readonly reason: SimIamInvalidCredentialsReason;
  public readonly accessKeyStatus?: SimIamAccessKeyStatus | undefined;
  public readonly expiration?: Date | undefined;

  constructor(properties: SimIamInvalidCredentialsProperties) {
    super(SimIamInvalidCredentials.message(properties));

    this.accessKeyId = properties.accessKeyId;
    this.reason = properties.reason;
    this.accessKeyStatus = properties.accessKeyStatus;
    this.expiration =
      properties.expiration === undefined
        ? undefined
        : new Date(properties.expiration);
  }

  private static message(
    properties: SimIamInvalidCredentialsProperties,
  ): string {
    const prefix = `Sim IAM could not authenticate access key ${properties.accessKeyId}`;

    switch (properties.reason) {
      case "unknown-access-key": {
        return `${prefix}: the access key is not registered`;
      }

      case "inactive-access-key": {
        return `${prefix}: the access key is ${
          properties.accessKeyStatus ?? "inactive"
        }`;
      }

      case "secret-access-key-mismatch": {
        return `${prefix}: the secret access key does not match`;
      }

      case "session-token-missing": {
        return `${prefix}: a session token is required`;
      }

      case "session-token-unexpected": {
        return `${prefix}: a session token was supplied for a long-lived access key`;
      }

      case "session-token-mismatch": {
        return `${prefix}: the session token does not match`;
      }

      case "expired-session": {
        return `${prefix}: the session expired${
          properties.expiration === undefined
            ? ""
            : ` at ${properties.expiration.toISOString()}`
        }`;
      }
    }
  }
}

/**
 * Raised when an access key ID is already registered.
 */
export class SimIamDuplicateAccessKey extends SimIamCredentialError {
  constructor(accessKeyId: string) {
    super(`Sim IAM access key ${accessKeyId} is already registered`);
  }
}
