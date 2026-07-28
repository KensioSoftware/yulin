import {
  type SimSecretsManagerSecretVersion,
  SimSecretsManagerStagingLabel,
} from "./sim-secrets-manager-secret-version.js";

/**
 * The versions of one simulated secret, and how staging labels move between
 * them.
 *
 * The label rules are the interesting part of Secrets Manager's data model and
 * they belong together: a label names exactly one version at a time, and
 * making a version current demotes the one that was.
 */
export class SimSecretsManagerSecretVersions {
  private readonly versions = new Map<string, SimSecretsManagerSecretVersion>();

  /**
   * Store a version and give it the staging labels it was written with.
   */
  add(
    version: SimSecretsManagerSecretVersion,
    stages: readonly string[],
  ): void {
    this.versions.set(version.versionId, version);

    for (const stage of stages) {
      this.moveStage(stage, version);
    }
  }

  /**
   * Find a version by its version id.
   */
  byId(versionId: string): SimSecretsManagerSecretVersion | undefined {
    return this.versions.get(versionId);
  }

  /**
   * Find the version a staging label currently names.
   */
  byStage(label: string): SimSecretsManagerSecretVersion | undefined {
    return this.versions.values().find((version) => version.hasStage(label));
  }

  /**
   * The version AWSCURRENT names, which is what a plain read returns.
   */
  get current(): SimSecretsManagerSecretVersion | undefined {
    return this.byStage(SimSecretsManagerStagingLabel.Current);
  }

  /**
   * The version ids carrying at least one staging label, as DescribeSecret
   * reports them.
   *
   * Versions that have lost every label are left out, because that is how real
   * Secrets Manager reports a version on its way out of existence.
   */
  versionIdsToStages(): Record<string, string[]> {
    const entries = this.versions
      .values()
      .filter((version) => version.isLabelled)
      .map((version): [string, string[]] => [
        version.versionId,
        [...version.stages],
      ]);

    return Object.fromEntries(entries);
  }

  /**
   * Attach a staging label to one version, taking it off whichever version
   * held it before.
   *
   * Making a version current is the one move with a consequence of its own:
   * the version that was current becomes AWSPREVIOUS, and whatever was
   * AWSPREVIOUS loses the label.
   */
  private moveStage(
    label: string,
    version: SimSecretsManagerSecretVersion,
  ): void {
    if (label === SimSecretsManagerStagingLabel.Current) {
      this.demoteCurrent(version);
    }

    for (const other of this.versions.values()) {
      other.removeStage(label);
    }

    version.addStage(label);
  }

  private demoteCurrent(incoming: SimSecretsManagerSecretVersion): void {
    const outgoing = this.current;

    if (outgoing === undefined || outgoing === incoming) {
      return;
    }

    const previous = this.byStage(SimSecretsManagerStagingLabel.Previous);
    previous?.removeStage(SimSecretsManagerStagingLabel.Previous);

    outgoing.addStage(SimSecretsManagerStagingLabel.Previous);
  }
}
