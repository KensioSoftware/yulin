import { SimAthenaWorkGroupConfiguration } from "./sim-athena-work-group-configuration.js";

/**
 * Whether a workgroup takes queries.
 */
export type SimAthenaWorkGroupState = "ENABLED" | "DISABLED";

interface SimAthenaWorkGroupProperties {
  readonly name: string;
  readonly createdAt: Date;
  readonly description?: string | undefined;
  readonly state?: SimAthenaWorkGroupState | undefined;
  readonly configuration?: SimAthenaWorkGroupConfiguration | undefined;
}

/**
 * One simulated Athena workgroup.
 *
 * A workgroup is where the settings a query runs under live: where its results
 * go, and how many bytes it may scan before Athena stops it. Nothing runs a
 * query here yet, so the workgroup is a record that a stack can be read back
 * from.
 *
 * Held immutably. `UpdateWorkGroup` replaces the stored workgroup with a new
 * one rather than mutating it, which keeps a workgroup a caller is already
 * holding from changing under it.
 */
export class SimAthenaWorkGroup {
  public readonly name: string;
  public readonly createdAt: Date;
  public readonly description: string | undefined;
  public readonly state: SimAthenaWorkGroupState;
  public readonly configuration: SimAthenaWorkGroupConfiguration;

  constructor(properties: SimAthenaWorkGroupProperties) {
    this.name = properties.name;
    this.createdAt = properties.createdAt;
    this.description = properties.description;
    this.state = properties.state ?? "ENABLED";
    this.configuration =
      properties.configuration ?? new SimAthenaWorkGroupConfiguration();
  }

  /**
   * How many bytes a query in this workgroup may scan, if it says.
   */
  get bytesScannedCutoffPerQuery(): number | undefined {
    return this.configuration.bytesScannedCutoffPerQuery;
  }

  /**
   * Where this workgroup's query results go, if it says.
   */
  get outputLocation(): string | undefined {
    return this.configuration.outputLocation;
  }

  /**
   * Whether this workgroup's settings override what a request asks for.
   */
  get enforcesConfiguration(): boolean {
    return this.configuration.enforceWorkGroupConfiguration;
  }

  /**
   * The same workgroup with whatever an update changed.
   */
  updated(properties: {
    readonly description?: string | undefined;
    readonly state?: SimAthenaWorkGroupState | undefined;
    readonly configuration?: SimAthenaWorkGroupConfiguration | undefined;
  }): SimAthenaWorkGroup {
    return new SimAthenaWorkGroup({
      name: this.name,
      createdAt: this.createdAt,
      description: properties.description ?? this.description,
      state: properties.state ?? this.state,
      configuration: properties.configuration ?? this.configuration,
    });
  }
}
