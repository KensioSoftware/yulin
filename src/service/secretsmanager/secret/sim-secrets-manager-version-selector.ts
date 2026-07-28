import { SimSecretsManagerResourceNotFoundException } from "../error/sim-secrets-manager.error.js";
import type { SimSecretsManagerSecret } from "./sim-secrets-manager-secret.js";
import {
  type SimSecretsManagerSecretVersion,
  SimSecretsManagerStagingLabel,
} from "./sim-secrets-manager-secret-version.js";

/**
 * The version-naming fields a read request can carry.
 */
export interface SimSecretsManagerVersionSelection {
  readonly VersionId?: string | undefined;
  readonly VersionStage?: string | undefined;
}

/**
 * Picks the version of a secret a read request asks for.
 *
 * Real Secrets Manager lets a caller name a version by id, by staging label,
 * by both, or by neither, and defaults to AWSCURRENT. Keeping those four cases
 * in one place is what stops the read command being mostly about them.
 */
export class SimSecretsManagerVersionSelector {
  /**
   * Resolve the version a request names, or refuse.
   *
   * A request naming both a version id and a staging label has to agree with
   * itself, as it does on real AWS: the label must be on that very version.
   */
  select(
    secret: SimSecretsManagerSecret,
    selection: SimSecretsManagerVersionSelection,
  ): SimSecretsManagerSecretVersion {
    if (selection.VersionId !== undefined) {
      return this.byId(secret, selection.VersionId, selection.VersionStage);
    }

    return this.byStage(
      secret,
      selection.VersionStage ?? SimSecretsManagerStagingLabel.Current,
    );
  }

  private byStage(
    secret: SimSecretsManagerSecret,
    stage: string,
  ): SimSecretsManagerSecretVersion {
    const version = secret.versions.byStage(stage);

    if (version === undefined) {
      throw new SimSecretsManagerResourceNotFoundException(
        `Secrets Manager can't find the specified secret value for staging ` +
          `label: ${stage}`,
      );
    }

    return version;
  }

  private byId(
    secret: SimSecretsManagerSecret,
    versionId: string,
    stage: string | undefined,
  ): SimSecretsManagerSecretVersion {
    const version = secret.versions.byId(versionId);

    if (version === undefined) {
      throw new SimSecretsManagerResourceNotFoundException(
        `Secrets Manager can't find the specified secret value for ` +
          `VersionId: ${versionId}`,
      );
    }

    if (stage !== undefined && !version.hasStage(stage)) {
      throw new SimSecretsManagerResourceNotFoundException(
        `Version ${versionId} does not carry the staging label ${stage}`,
      );
    }

    return version;
  }
}
