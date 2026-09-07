import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";

/**
 * A simulated AWS in one account and region, for a secret update test.
 */
export function secretUpdateSimAws(): SimAws {
  return new SimAws({
    defaultAccountId: "111111111111",
    defaultRegionName: "eu-west-2",
  });
}

/**
 * Deploy a template and wait for its Resources.
 */
export async function deploySecretStack(
  simAws: SimAws,
  stackName: string,
  template: CfnTemplateBodyRecord,
): Promise<void> {
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName, template });

  await stack.waitForDeployComplete();
}

/**
 * Apply a template to a deployed stack and wait for the update.
 */
export async function updateSecretStack(
  simAws: SimAws,
  stackName: string,
  template: CfnTemplateBodyRecord,
): Promise<void> {
  await simAws.cloudFormation().updateStack({
    input: { StackName: stackName, TemplateBody: jsonStringify(template) },
  });
  await simAws.cloudFormation().waitForStackUpdateComplete(stackName);
}

/**
 * The ARN of the secret a deployed stack holds.
 */
export function deployedSecretArn(simAws: SimAws, stackName: string): string {
  const stack = simAws.cloudFormation().getStackByName(stackName);
  const secret = stack?.getResource("EdgeCredential")?.simResource as
    | { arn: { value: string } }
    | undefined;

  assertDefined(secret, `deployed EdgeCredential secret in Stack ${stackName}`);

  return secret.arn.value;
}
