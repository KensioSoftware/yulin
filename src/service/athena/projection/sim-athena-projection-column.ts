/** The four ways Athena projects a partition column. */
export type SimAthenaProjectionType = "enum" | "integer" | "date" | "injected";

/** How one partition column is projected. */
export interface SimAthenaProjectionColumn {
  readonly name: string;
  readonly type: SimAthenaProjectionType;

  /** The values an `enum` column takes. */
  readonly values: readonly string[] | undefined;

  /** The bounds an `integer` or a `date` column runs between. */
  readonly range: string | undefined;

  /** The date pattern a `date` column's values are written in. */
  readonly format: string | undefined;

  /** How far apart two values sit. */
  readonly interval: number | undefined;

  /** What that interval counts, for a `date` column. */
  readonly intervalUnit: string | undefined;

  /** The width an `integer` column's values are zero padded to. */
  readonly digits: number | undefined;
}

/** A table's whole partition projection configuration. */
export interface SimAthenaProjection {
  readonly enabled: boolean;

  /** Where each projected partition's data sits, with `${key}` placeholders. */
  readonly locationTemplate: string | undefined;

  readonly columns: readonly SimAthenaProjectionColumn[];
}
