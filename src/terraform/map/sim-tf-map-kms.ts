/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  field,
  properties,
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/**
 * A key.
 *
 * Terraform spells the key spec `customer_master_key_spec`, which is the name
 * the KMS API used before AWS renamed it, and CloudFormation carries the new
 * one. `is_enabled` is CloudFormation's `Enabled`.
 *
 * Rotation and tags go across as they were written. Simulated KMS records both
 * as properties a key is created without, rather than refusing them, so a key
 * asking for rotation deploys and says on the Resource that its material never
 * changes.
 */
export function kmsKey(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const policy = keyPolicy(context);

  return {
    Type: "AWS::KMS::Key",
    Properties: {
      ...renamed(context, {
        Description: "description",
        Enabled: "is_enabled",
        KeySpec: "customer_master_key_spec",
        KeyUsage: "key_usage",
        EnableKeyRotation: "enable_key_rotation",
      }),
      ...properties({ KeyPolicy: policy, Tags: tags(context) }),
    },
    lost: policy === undefined && declaredPolicy(context) ? ["policy"] : [],
  };
}

/**
 * The key policy, which Terraform carries as a JSON string.
 *
 * A policy written with `jsonencode` around an ARN of the same plan is unknown
 * in its entirety, and its statements are gone with it. The reference behind it
 * resolves to the ARN rather than to a document, so there is nothing to send
 * and the attribute is recorded instead. A key created without a policy gets
 * the default root delegation KMS applies, which is what a key declaring no
 * policy gets anyway, so the key still exists and still encrypts.
 */
function keyPolicy(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const policy = field(context.resource.values, "policy");

  return typeof policy === "string" ? policy : undefined;
}

/**
 * Whether the configuration wrote a policy the plan could not resolve.
 *
 * A key declaring no policy at all is unknown in the plan too, because KMS is
 * the one that writes the default. That one is not lost: a key created here
 * without a policy gets the same root delegation, so only a policy the
 * configuration stated and the plan could not build is worth recording.
 */
function declaredPolicy(context: TerraformMappingContext): boolean {
  return (
    context.resource.unknown["policy"] === true &&
    context.resource.expressions["policy"] !== undefined
  );
}

/**
 * An alias.
 *
 * Both properties are required, as they are on real CloudFormation. An alias
 * with no name names nothing and one with no target points at nothing, so an
 * alias whose key the template does not declare is left out rather than
 * deployed into a failure that would take the Stack with it.
 */
export function kmsAlias(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::KMS::Alias",
    Properties: renamed(context, {
      AliasName: "name",
      TargetKeyId: "target_key_id",
    }),
    requires: ["AliasName", "TargetKeyId"],
  };
}
