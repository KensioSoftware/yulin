import { SimAthenaResultConfiguration } from "./sim-athena-result-configuration.js";
import type { SimAthenaWorkGroupConfigurationUpdates } from "./sim-athena-work-group-updates.js";

/**
 * Which query engine a workgroup runs on.
 */
export interface SimAthenaEngineVersion {
  readonly selectedEngineVersion?: string | undefined;
  readonly effectiveEngineVersion?: string | undefined;
}

interface SimAthenaWorkGroupConfigurationProperties {
  readonly bytesScannedCutoffPerQuery?: number | undefined;
  readonly enforceWorkGroupConfiguration?: boolean | undefined;
  readonly publishCloudWatchMetricsEnabled?: boolean | undefined;
  readonly requesterPaysEnabled?: boolean | undefined;
  readonly resultConfiguration?: SimAthenaResultConfiguration | undefined;
  readonly engineVersion?: SimAthenaEngineVersion | undefined;
}

/**
 * The settings one workgroup carries.
 *
 * `BytesScannedCutoffPerQuery` is the cost guardrail: Athena refuses a query
 * that scans past it. Nothing enforces it yet, because nothing here runs a
 * query. Holding it and handing it back is what lets a stack prove the
 * guardrail was configured, and enforcing it is issue 992.
 *
 * Real Athena will not take a cutoff below 10MB. This simulation takes any
 * positive number, so a test can put the guardrail where the query it is
 * exercising needs it. The docs page lists the divergence.
 */
export class SimAthenaWorkGroupConfiguration {
  public readonly bytesScannedCutoffPerQuery: number | undefined;
  public readonly enforceWorkGroupConfiguration: boolean;
  public readonly publishCloudWatchMetricsEnabled: boolean;
  public readonly requesterPaysEnabled: boolean;
  public readonly resultConfiguration: SimAthenaResultConfiguration | undefined;
  public readonly engineVersion: SimAthenaEngineVersion | undefined;

  constructor(properties: SimAthenaWorkGroupConfigurationProperties = {}) {
    this.bytesScannedCutoffPerQuery = properties.bytesScannedCutoffPerQuery;
    this.enforceWorkGroupConfiguration =
      properties.enforceWorkGroupConfiguration ?? false;
    this.publishCloudWatchMetricsEnabled =
      properties.publishCloudWatchMetricsEnabled ?? false;
    this.requesterPaysEnabled = properties.requesterPaysEnabled ?? false;
    this.resultConfiguration = properties.resultConfiguration;
    this.engineVersion = properties.engineVersion;
  }

  /**
   * Where this workgroup's query results go, if it says.
   */
  get outputLocation(): string | undefined {
    return this.resultConfiguration?.outputLocation;
  }

  /**
   * Apply an `UpdateWorkGroup` configuration update.
   *
   * Athena updates a workgroup field by field rather than by replacement, and
   * clearing a field takes its own `Remove...` flag. An update leaving a field
   * out keeps whatever the workgroup already had.
   */
  updatedWith(
    updates: SimAthenaWorkGroupConfigurationUpdates,
  ): SimAthenaWorkGroupConfiguration {
    const results = updates.resultConfigurationUpdates;

    return new SimAthenaWorkGroupConfiguration({
      bytesScannedCutoffPerQuery:
        updates.removeBytesScannedCutoffPerQuery === true
          ? undefined
          : (updates.bytesScannedCutoffPerQuery ??
            this.bytesScannedCutoffPerQuery),
      enforceWorkGroupConfiguration:
        updates.enforceWorkGroupConfiguration ??
        this.enforceWorkGroupConfiguration,
      publishCloudWatchMetricsEnabled:
        updates.publishCloudWatchMetricsEnabled ??
        this.publishCloudWatchMetricsEnabled,
      requesterPaysEnabled:
        updates.requesterPaysEnabled ?? this.requesterPaysEnabled,
      engineVersion: updates.engineVersion ?? this.engineVersion,
      resultConfiguration:
        results === undefined
          ? this.resultConfiguration
          : (this.resultConfiguration ?? empty).updatedWith(results),
    });
  }
}

/**
 * What an update merges into where the workgroup has no result configuration.
 */
const empty = new SimAthenaResultConfiguration();
