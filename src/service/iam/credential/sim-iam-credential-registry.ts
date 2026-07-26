import type {
  SimAwsCredentials,
  SimIamCredentialIdentity,
} from "./sim-aws-credentials.js";
import type { SimIamAccessKey } from "./sim-iam-access-key.js";
import { SimIamAccessKeyChecks } from "./sim-iam-access-key-checks.js";
import {
  SimIamDuplicateAccessKey,
  SimIamInvalidCredentials,
} from "./error/sim-iam-credential.error.js";
import { type SimClock, SimRealClock } from "../../../util/clock/sim-clock.js";
import type { SimIamAccessKeyIndex } from "./sim-iam-signing-credential.js";

interface SimIamCredentialRegistryProperties {
  /**
   * Clock deciding whether a temporary session has expired. Session expiry is
   * simulated state, so it is judged in simulated time rather than host time.
   */
  readonly clock?: SimClock;
  /**
   * Simulation-wide index told about every key registered here, so a signed
   * request naming only an access key id can be traced back to this Account.
   */
  readonly accessKeyIndex?: SimIamAccessKeyIndex | undefined;
}

/**
 * Stores and authenticates simulated IAM access keys.
 *
 * The registry is agnostic about the principal type represented by an access
 * key. Temporary sessions and future IAM-user access keys share the same lookup
 * and authentication behavior.
 */
export class SimIamCredentialRegistry {
  private readonly accessKeys = new Map<string, SimIamAccessKey>();
  private readonly clock: SimClock;
  private readonly accessKeyIndex?: SimIamAccessKeyIndex | undefined;
  private readonly checks = new SimIamAccessKeyChecks();

  constructor(properties: SimIamCredentialRegistryProperties = {}) {
    this.clock = properties.clock ?? new SimRealClock();
    this.accessKeyIndex = properties.accessKeyIndex;
  }

  /**
   * Register a new simulated access key.
   */
  registerAccessKey(accessKey: SimIamAccessKey): void {
    if (this.accessKeys.has(accessKey.accessKeyId)) {
      throw new SimIamDuplicateAccessKey(accessKey.accessKeyId);
    }

    this.accessKeys.set(accessKey.accessKeyId, accessKey);
    this.accessKeyIndex?.registerAccessKey(accessKey.accessKeyId);
  }

  /**
   * Authenticate credentials and resolve their simulated AWS identity.
   */
  resolveCredentials(
    credentials: SimAwsCredentials,
    now: Date = this.clock.now(),
  ): SimIamCredentialIdentity {
    const accessKey = this.activeAccessKey(credentials.accessKeyId);

    if (!accessKey.matchesSecretAccessKey(credentials.secretAccessKey)) {
      throw new SimIamInvalidCredentials({
        accessKeyId: credentials.accessKeyId,
        reason: "secret-access-key-mismatch",
      });
    }

    this.checks.checkSessionToken(accessKey, credentials.sessionToken);
    this.checks.checkNotExpired(accessKey, now);

    return accessKey.identity();
  }

  /**
   * Authenticate an access key without a secret to compare.
   *
   * A signed request proves possession of the secret by its signature rather
   * than by presenting it, so everything except the secret is checked here and
   * the signature settles the rest.
   */
  authenticateAccessKey(
    accessKeyId: string,
    sessionToken: string | undefined,
    now: Date = this.clock.now(),
  ): SimIamAccessKey {
    const accessKey = this.activeAccessKey(accessKeyId);

    this.checks.checkSessionToken(accessKey, sessionToken);
    this.checks.checkNotExpired(accessKey, now);

    return accessKey;
  }

  private activeAccessKey(accessKeyId: string): SimIamAccessKey {
    return this.checks.activeAccessKey(this.accessKeys.get(accessKeyId), {
      accessKeyId,
    });
  }
}
