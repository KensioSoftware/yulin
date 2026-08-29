import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { maximumSimSecretsManagerNameLength } from "../../secret/sim-secrets-manager-secret-name.js";

/**
 * The name CloudFormation gives a secret whose template does not name it.
 *
 * Five hundred and twelve characters is long enough that a stack name and a
 * logical ID rarely reach it, so the trimming `SimCfnGeneratedResourceName`
 * does is the exception here rather than the usual case. The case is left
 * alone, since Secrets Manager keeps a name as it was given, and every
 * character a stack name or a logical ID is made of is one a secret name
 * allows.
 *
 * Real Secrets Manager appends six random characters of its own to a secret's
 * ARN whatever the name is, which is why a template reading the ARN back has to
 * read it off the Resource either way.
 */
export function simCfnSecretsManagerGeneratedName(
  resource: SimCfnResource,
): string {
  return new SimCfnGeneratedResourceName({
    stackName: resource.stackName,
    logicalId: resource.logicalId,
    maximumLength: maximumSimSecretsManagerNameLength,
  }).value;
}
