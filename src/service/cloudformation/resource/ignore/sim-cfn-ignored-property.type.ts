/**
 * One property of a CloudFormation Resource that was deployed unread.
 *
 * The Resource exists and is usable. The property named here was left out of
 * it, so the simulated Resource behaves as though the template had never
 * declared that property at all.
 */
export interface SimCfnIgnoredProperty {
  /** The logical ID of the Resource the property was declared on. */
  readonly logicalId: string;

  /** The Resource type, e.g. `AWS::S3::Bucket`. */
  readonly resourceType: string;

  /**
   * The whole way to the property, so a setting on one entry of a list says
   * which entry it was on, e.g. `GlobalSecondaryIndexes.1.OnDemandThroughput`.
   */
  readonly path: string;

  /** Why the property was ignored rather than acted on. */
  readonly reason: string;
}

/**
 * What a service property parser records an ignored property against.
 *
 * Narrow on purpose: a property parser needs to say that it ignored something,
 * and nothing else about the Resource holding it.
 */
export interface SimCfnPropertyIgnorer {
  /**
   * Record that this Resource is being created without acting on a property.
   */
  ignoreProperty(path: string, reason: string): void;
}
