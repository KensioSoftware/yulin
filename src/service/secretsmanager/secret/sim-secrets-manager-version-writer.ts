import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import {
  SimSecretsManagerInvalidParameterException,
  SimSecretsManagerResourceExistsException,
} from "../error/sim-secrets-manager.error.js";
import type { SimSecretsManagerSecret } from "./sim-secrets-manager-secret.js";
import {
  SimSecretsManagerSecretVersion,
  SimSecretsManagerStagingLabel,
} from "./sim-secrets-manager-secret-version.js";
import type { SimSecretsManagerSecretValue } from "./sim-secrets-manager-secret-value.js";

/**
 * The version-shaping fields a write request can carry.
 */
export interface SimSecretsManagerVersionWriteInput {
  readonly ClientRequestToken?: string | undefined;
  readonly VersionStages?: readonly string[] | undefined;
}

interface SimSecretsManagerVersionWriterProperties {
  readonly clock: SimClock;
}

/**
 * Writes a new version of a secret, the way every Secrets Manager write does.
 *
 * CreateSecret, PutSecretValue and UpdateSecret all end in the same place:
 * a new version carrying the value, labelled AWSCURRENT unless told otherwise.
 * Keeping that in one collaborator is what stops the three commands drifting
 * apart on staging labels or on request-token idempotency.
 */
export class SimSecretsManagerVersionWriter {
  private readonly clock: SimClock;

  constructor(properties: SimSecretsManagerVersionWriterProperties) {
    this.clock = properties.clock;
  }

  /**
   * Write a value as a new version of a secret.
   *
   * A ClientRequestToken becomes the version id, as it does on real AWS. A
   * repeat of the same token with the same value is ignored, which is what
   * makes a retried write safe; the same token with a different value is
   * refused, because a version's value never changes once written.
   */
  write(
    secret: SimSecretsManagerSecret,
    value: SimSecretsManagerSecretValue,
    input: SimSecretsManagerVersionWriteInput,
  ): SimSecretsManagerSecretVersion {
    const versionId = input.ClientRequestToken ?? randomUUID();
    const existing = secret.versions.byId(versionId);

    if (existing !== undefined) {
      return this.repeatedWrite(existing, value);
    }

    const version = new SimSecretsManagerSecretVersion({
      versionId,
      value,
      createdDate: this.clock.now(),
    });

    secret.versions.add(version, this.stages(input.VersionStages));
    secret.lastChangedDate = this.clock.now();

    return version;
  }

  /**
   * Resolve the staging labels a new version is written with.
   */
  private stages(requested: readonly string[] | undefined): readonly string[] {
    if (requested === undefined) {
      return [SimSecretsManagerStagingLabel.Current];
    }

    if (requested.length === 0) {
      throw new SimSecretsManagerInvalidParameterException(
        "VersionStages must name at least one staging label",
      );
    }

    return requested;
  }

  private repeatedWrite(
    existing: SimSecretsManagerSecretVersion,
    value: SimSecretsManagerSecretValue,
  ): SimSecretsManagerSecretVersion {
    if (existing.value.equals(value)) {
      return existing;
    }

    throw new SimSecretsManagerResourceExistsException(
      `Version ${existing.versionId} already exists with a different value. ` +
        `A secret version cannot be modified once written.`,
    );
  }
}
