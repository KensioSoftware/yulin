import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../sim-cfn-resource.js";
import type { SimCloudFormationResourceUpdateContext } from "../sim-cfn-resource.type.js";

export interface SimCfnServiceResourceFactory {
  create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined>;

  /**
   * Remove a Resource this factory created.
   *
   * The service owning a Resource type is the one that knows which command
   * removes it, and what has to be true before that command will work: a
   * CloudFront distribution has to be disabled first, an IAM role has to have
   * its policies taken off it. CloudFormation orchestrates the order Resources
   * come down in and nothing more.
   *
   * A Resource type this factory can create but has no way to remove should
   * throw an unsupported-Resource error, the same as an unknown type does, so
   * the teardown records it and carries on.
   */
  delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void>;

  /**
   * Refuse an invalid replacement before CloudFormation deletes anything.
   *
   * Most simulated Resource types have no update-specific validation. A
   * service can implement this hook when an update carries constraints that a
   * create request cannot check.
   */
  assertUpdateAllowed?(
    resourceTypeName: string,
    current: SimCfnResource,
    updated: SimCfnResource,
    context: SimCloudFormationResourceUpdateContext,
  ): Promise<void> | void;
}

export interface SimCloudFormationParsedResourceType {
  readonly providerName: string;
  readonly serviceName: string;
  readonly resourceTypeName: string;
}
