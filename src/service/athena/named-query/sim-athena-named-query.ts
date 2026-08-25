interface SimAthenaNamedQueryProperties {
  readonly namedQueryId: string;
  readonly name: string;
  readonly database: string;
  readonly queryString: string;
  readonly workGroupName: string;
  readonly description?: string | undefined;
}

/**
 * One simulated Athena named query.
 *
 * A named query is SQL saved under a name so the console and the SDK can find
 * it again. Nothing runs it. Athena stores the text and hands it back, and so
 * does this.
 *
 * The query text is never parsed. A named query holding SQL no engine would
 * accept is stored here exactly as a caller sent it, which the docs page lists
 * under Limitations.
 */
export class SimAthenaNamedQuery {
  public readonly namedQueryId: string;
  public readonly name: string;
  public readonly database: string;
  public readonly queryString: string;
  public readonly workGroupName: string;
  public readonly description: string | undefined;

  constructor(properties: SimAthenaNamedQueryProperties) {
    this.namedQueryId = properties.namedQueryId;
    this.name = properties.name;
    this.database = properties.database;
    this.queryString = properties.queryString;
    this.workGroupName = properties.workGroupName;
    this.description = properties.description;
  }
}
