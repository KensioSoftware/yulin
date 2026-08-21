/**
 * What every simulated Personalize resource carries.
 *
 * Real Personalize gives each of its resources an ARN, a name, a status and a
 * pair of timestamps, and reports all five back from the matching `Describe`.
 * Holding them in one shape is what lets a single store serve every resource
 * type.
 */
export interface SimPersonalizeResource {
  readonly arn: string;
  readonly name: string;
  readonly status: string;
  readonly creationDateTime: Date;
  readonly lastUpdatedDateTime: Date;
}
