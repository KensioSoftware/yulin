import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamUser } from "../../../iam/user/sim-iam-user.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import type { SimCfnDeployedStack } from "../../stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValue } from "../value/sim-cfn-template-value.js";

/**
 * An organization denying its Accounts' root principals everything, which a
 * reference resolved as the root fails against and one resolved as a Role
 * deploying the Stack does not.
 */
const denyAccountRoot = {
  Version: "2012-10-17",
  Statement: {
    Effect: "Deny",
    Action: "*",
    Resource: "*",
    Condition: { ArnLike: { "aws:PrincipalArn": "arn:aws:iam::*:root" } },
  },
} as const;

interface DeploymentAccount {
  readonly simAws: SimAws;
  readonly accountId: SimAwsAccountId;
}

function deploymentAccount(): DeploymentAccount {
  const accountId = makeSimAwsAccountId();

  return { accountId, simAws: new SimAws({ defaultAccountId: accountId }) };
}

/**
 * A Role a deployment can run as, allowed the actions it is given.
 */
async function deployRole(
  simAws: SimAws,
  roleName: string,
  actions: readonly string[],
): Promise<SimAwsCaller> {
  const role = await simIamRoleWithPolicyFactory.make(
    { roleName, actions },
    simAws,
  );

  return { kind: "arn", arn: role.Arn };
}

/**
 * Deploy a parameter holding the value under test, so that whatever the
 * reference resolved to can be read back out of the simulation.
 */
async function deployReading(
  simAws: SimAws,
  value: SimCfnTemplateValue,
  caller?: SimAwsCaller,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "site-stack",
    template: {
      Resources: {
        EdgeToken: {
          Type: "AWS::SSM::Parameter",
          Properties: {
            Name: "/site/edge-token",
            Type: "String",
            Value: value,
          },
        },
      },
    },
    ...(caller !== undefined && { caller }),
  });
  await stack.waitForDeployComplete();

  return stack;
}

function readParameter(simAws: SimAws): string | undefined {
  return simAws.ssm().findParameter("/site/edge-token")?.currentVersion.value
    .value;
}

describe("the principal a CloudFormation dynamic reference is resolved as", () => {
  it("reads a secretsmanager reference as the Role the deployment names", async () => {
    // Given a secret, a deploy Role allowed everything, and an organization
    // denying the Account root.
    const { simAws, accountId } = deploymentAccount();
    const deployer = await deployRole(simAws, "deployer", ["*"]);

    await simAws.secretsManager().createSecret({
      input: { Name: "site/edge-token", SecretString: "s3cret" },
    });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    // When a Stack reading that secret is deployed as the Role.
    await deployReading(
      simAws,
      "{{resolve:secretsmanager:site/edge-token}}",
      deployer,
    );

    // Then the reference was read as the Role, so the deny naming the root
    // never reached it.
    assertIdentical(readParameter(simAws), "s3cret");
  });

  it("reads an ssm-secure reference as that Role too", async () => {
    // Given a SecureString parameter, the same deploy Role, and the same
    // organization.
    const { simAws, accountId } = deploymentAccount();
    const deployer = await deployRole(simAws, "deployer", ["*"]);

    await simAws.ssm().putParameter({
      input: {
        Name: "/site/console-password",
        Type: "SecureString",
        Value: "hunter2",
      },
    });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    // When a Stack reading it into a console User's password is deployed as
    // the Role.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "console-stack",
      template: {
        Resources: {
          ConsoleUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "ConsoleUser",
              LoginProfile: {
                Password: "{{resolve:ssm-secure:/site/console-password}}",
              },
            },
          },
        },
      },
      caller: deployer,
    });
    await stack.waitForDeployComplete();

    // Then the parameter was decrypted as the Role rather than as the root.
    const user = stack.getResource("ConsoleUser")?.simResource as
      | SimIamUser
      | undefined;

    assertNonNullable(user?.loginProfile, "the deployed User's login profile");
    assertIdentical(user.loginProfile.password, "hunter2");
  });

  it("leaves a deployment that names no caller reading as the Account root", async () => {
    // Given the same secret and organization, and no deploy Role.
    const { simAws, accountId } = deploymentAccount();

    await simAws.secretsManager().createSecret({
      input: { Name: "site/edge-token", SecretString: "s3cret" },
    });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    // When a Stack reading the secret is deployed without naming a principal.
    const error = await assertThrowsErrorAsync(async () => {
      await deployReading(simAws, "{{resolve:secretsmanager:site/edge-token}}");
    });

    // Then the read was decided as the root, as it was before there was
    // anything to say otherwise.
    assertStringIncludes(error.message, `arn:aws:iam::${accountId}:root`);
    assertStringIncludes(error.message, "secretsmanager:GetSecretValue");
    assertUndefined(readParameter(simAws));
  });

  it("fails the Resource when the Role it names may not read the reference", async () => {
    // Given a secret, and a deploy Role that may write parameters and not read
    // secrets.
    const { simAws, accountId } = deploymentAccount();
    const writer = await deployRole(simAws, "writer", ["ssm:*"]);

    await simAws.secretsManager().createSecret({
      input: { Name: "site/edge-token", SecretString: "s3cret" },
    });

    // When a Stack reading that secret is deployed as it.
    const error = await assertThrowsErrorAsync(async () => {
      await deployReading(
        simAws,
        "{{resolve:secretsmanager:site/edge-token}}",
        writer,
      );
    });

    // Then the refusal names the Role rather than the Account root.
    assertStringIncludes(
      error.message,
      `arn:aws:iam::${accountId}:role/writer is not authorized to perform: secretsmanager:GetSecretValue`,
    );
    assertIdentical(
      simAws
        .cloudFormation()
        .getStackByName("site-stack")
        ?.getResource("EdgeToken")?.status,
      "CREATE_FAILED",
    );
  });

  it("resolves a reference for teardown as the principal the Stack was deployed as", async () => {
    // Given a Stack whose properties hold a secret reference, deployed as a
    // Role in an organization denying the root.
    const { simAws, accountId } = deploymentAccount();
    const deployer = await deployRole(simAws, "deployer", ["*"]);

    await simAws.secretsManager().createSecret({
      input: { Name: "site/edge-token", SecretString: "s3cret" },
    });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    const stack = await deployReading(
      simAws,
      "{{resolve:secretsmanager:site/edge-token}}",
      deployer,
    );

    // When the Stack is torn down, which resolves its properties again.
    await stack.teardown();

    // Then the reference was read as that Role, so the parameter has gone.
    assertUndefined(readParameter(simAws));
  });
});
