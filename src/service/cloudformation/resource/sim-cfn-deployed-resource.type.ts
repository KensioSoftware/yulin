import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../template/value/sim-cfn-template-value.js";
import type { SimCfnIgnoredProperty } from "./ignore/sim-cfn-ignored-property.type.js";
import type { SimCloudFormationResourceStatus } from "./sim-cfn-resource.type.js";

/**
 * One Resource of a deployed Stack, as the caller that deployed it reads one.
 *
 * Everything here answers a question about the Resource. Creating and deleting
 * a Resource belongs to the deployment that owns it, and those members stay
 * inside the package with the class implementing this.
 */
export interface SimCfnDeployedResource {
  /** The logical ID the template declared this Resource under. */
  readonly logicalId: string;

  /** The Stack this Resource was deployed as part of. */
  readonly stackName: string | undefined;

  /** The Resource type, e.g. `AWS::S3::Bucket`. */
  readonly type: string | undefined;

  /** The Resource's template properties, with references resolved. */
  readonly properties: SimCfnTemplateValueRecord;

  /** Properties the deployment created this Resource without acting on. */
  readonly ignoredProperties: readonly SimCfnIgnoredProperty[];

  /** The Resource's `DeletionPolicy`, where the template declared one. */
  readonly deletionPolicy: string | undefined;

  /** Whether a Stack teardown leaves this Resource where it is. */
  readonly retainedOnDelete: boolean;

  /** What `Ref` on this Resource resolves to. */
  readonly refValue: SimCfnTemplateValue;

  /** The simulated AWS object this Resource created, once it has one. */
  readonly simResource: object | undefined;

  /** What CloudFormation last did to this Resource. */
  readonly status: SimCloudFormationResourceStatus;

  /** Whether the Resource reached simulated AWS. */
  readonly deployed: boolean;

  /** Whether the deployment skipped this Resource for want of a simulation. */
  readonly skipped: boolean;

  /** Why the Resource was skipped, where it was. */
  readonly skippedReason: string | undefined;

  /** Whether the Resource was created as nothing, because nothing reads it. */
  readonly inert: boolean;

  /** Why the Resource was created inert, where it was. */
  readonly inertReason: string | undefined;

  /** Whether creation finished. */
  readonly createComplete: boolean;

  /** Whether deletion finished. */
  readonly deleteComplete: boolean;

  /** Whether the Resource has been deleted from simulated AWS. */
  readonly deleted: boolean;

  /** Whether a teardown recorded this Resource in place of deleting it. */
  readonly deletionSkipped: boolean;

  /** Why the deletion was skipped, where it was. */
  readonly deletionSkippedReason: string | undefined;

  /** Whether a teardown left this Resource in simulated AWS. */
  readonly retained: boolean;

  /** What stopped this Resource, where something did. */
  readonly error: Error | undefined;

  /** What `Fn::GetAtt` for this attribute resolves to. */
  attributeValue(attributeName: string): SimCfnTemplateValue;
}
