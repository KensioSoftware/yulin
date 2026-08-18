/**
 * One `{{resolve:service:...}}` dynamic reference found inside a template
 * string.
 *
 * A dynamic reference is read out of a resolved string rather than parsed as
 * its own node, because CloudFormation lets one sit inside a longer value.
 * Only the span holding the reference is replaced, and the text around it is
 * left as it was written.
 */
export interface SimCfnDynamicReference {
  /** The whole reference as written, e.g. `{{resolve:ssm:/db/host:2}}`. */
  readonly text: string;

  /** The service the reference names, e.g. `ssm`. */
  readonly service: string;

  /** Everything after the service name, e.g. `/db/host:2`. */
  readonly body: string;
}

/**
 * What one service answers a dynamic reference with.
 *
 * A reference the service cannot answer still resolves to a value. Simulated
 * CloudFormation deploys what it can, and a template naming parameters a test
 * never created is one of the things it can mostly deploy. The stand-in value
 * carries a reason, which the Resource records so a test asserting on that
 * value can find out it was never read.
 */
export interface SimCfnDynamicReferenceResolution {
  /** The value the reference is replaced with. */
  readonly value: string;

  /** Why the value is a stand-in, left out when the reference resolved. */
  readonly reason?: string | undefined;
}

/**
 * How one simulated service answers the dynamic references naming it.
 */
export interface SimCfnDynamicReferenceResolver {
  resolve(reference: SimCfnDynamicReference): SimCfnDynamicReferenceResolution;
}
