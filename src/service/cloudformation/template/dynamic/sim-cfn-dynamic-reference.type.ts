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
 * Where in a Stack one dynamic reference was written.
 *
 * CloudFormation accepts an `ssm-secure` reference in a fixed list of Resource
 * properties and refuses it everywhere else, so the service answering a
 * reference has to be told where the reference sits. The path is the one an
 * ignored property is recorded under, e.g. `LoginProfile.Password`.
 */
export interface SimCfnDynamicReferenceSite {
  /** The Resource type holding the reference, e.g. `AWS::IAM::User`. */
  readonly resourceType: string | undefined;

  /** The path to the property inside the Resource's `Properties`. */
  readonly propertyPath: string;
}

/**
 * How one simulated service answers the dynamic references naming it.
 *
 * A service that cannot answer without being waited on returns a promise, as
 * Secrets Manager does (reading a secret decrypts it through simulated KMS).
 * Property resolution stays synchronous either way. A promised answer is
 * substituted once the Resource's properties have resolved around it, so the
 * resolver is free to await whatever answering takes.
 *
 * Throwing fails the Resource, which is what a reference the template had no
 * business writing does. A reference the service simply could not answer
 * resolves to a stand-in value instead.
 */
export interface SimCfnDynamicReferenceResolver {
  resolve(
    reference: SimCfnDynamicReference,
    site: SimCfnDynamicReferenceSite,
  ):
    | SimCfnDynamicReferenceResolution
    | Promise<SimCfnDynamicReferenceResolution>;
}
