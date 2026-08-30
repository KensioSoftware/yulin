import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";

/**
 * One skipped property, as a constraint on it reads the Resource.
 *
 * The whole Resource comes with it, because the constraints AWS enforces on a
 * property it is not acting on are usually about a second one. Replication on
 * an S3 Bucket needs versioning turned on beside it, and neither property is
 * simulated.
 */
export interface SimCfnSkippedPropertyValue {
  /** What the template declared for the skipped property. */
  readonly value: SimCfnTemplateValue;

  /** Everything else the Resource declared. */
  readonly properties: SimCfnTemplateValueRecord;

  /**
   * Refuse the Resource, in the service's own words.
   *
   * The wording matters. Sim CloudFormation downgrades a failure that reads as
   * an unsupported Resource type into a skip, and a skipped Resource here
   * would deploy the very template this exists to refuse, so each service
   * passes the error builder it already refuses its own Resources with.
   */
  refuse(reason: string): never;
}

/**
 * What a skipped value has to satisfy even though nothing acts on it.
 *
 * A value that passes is recorded against the Resource as any skipped value
 * is. One that fails takes the Resource with it, before anything is recorded.
 */
export type SimCfnSkippedPropertyConstraint = (
  declared: SimCfnSkippedPropertyValue,
) => void;

/**
 * What a service says about a property its Resource is created without acting
 * on.
 *
 * A reason on its own is the common case and stays a bare string. A property
 * carrying a value real AWS answers with a 400 states the constraint here too,
 * beside the reason, rather than in a check of its own somewhere up the call
 * path.
 */
export interface SimCfnSkippedPropertyRule {
  readonly reason: string;
  readonly constraint: SimCfnSkippedPropertyConstraint;
}

/**
 * The properties one Resource type is created without acting on, by name.
 *
 * Most name a reason and nothing more. The rest state what the value has to
 * satisfy alongside it.
 */
export type SimCfnSkippedPropertyRules = ReadonlyMap<
  string,
  SimCfnSkippedPropertyRule | string
>;
