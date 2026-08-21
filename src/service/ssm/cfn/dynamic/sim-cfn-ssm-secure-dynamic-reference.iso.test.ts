import { CreateKeyCommand } from "@aws-sdk/client-kms";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIamUser } from "../../../iam/user/sim-iam-user.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

/**
 * Deploy a console User whose password is the value under test.
 *
 * `AWS::IAM::User` `LoginProfile.Password` is the one property on
 * CloudFormation's `ssm-secure` list that a simulated Resource holds, and it is
 * where CDK writes `SecretValue.ssmSecure`.
 */
async function deployConsoleUser(
  simAws: SimAws,
  password: SimCfnTemplateValue,
  parameters: Record<string, { Type: string; Default?: string }> = {},
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "console-stack",
    template: {
      Parameters: parameters,
      Resources: {
        ConsoleUser: {
          Type: "AWS::IAM::User",
          Properties: {
            UserName: "ConsoleUser",
            LoginProfile: { Password: password },
          },
        },
      },
    },
  });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * The password the deployed User was created with.
 */
function consolePassword(stack: SimCfnDeployedStack): string {
  const user = stack.getResource("ConsoleUser")?.simResource as
    | SimIamUser
    | undefined;
  assertNonNullable(user?.loginProfile, "the deployed User's login profile");

  return user.loginProfile.password;
}

describe("SSM CloudFormation ssm-secure dynamic references", () => {
  it("resolves a reference to the decrypted parameter value", async () => {
    // Given a SecureString parameter holding a password.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/console-password",
        Type: "SecureString",
        Value: "hunter2",
      },
    });

    // When a template reads it through an ssm-secure dynamic reference.
    const stack = await deployConsoleUser(
      simAws,
      "{{resolve:ssm-secure:/myapp/console-password}}",
    );

    // Then the Resource is created with the plaintext rather than the
    // ciphertext Parameter Store holds.
    assertIdentical(consolePassword(stack), "hunter2");
  });

  it("resolves a reference to the version it names", async () => {
    // Given a SecureString parameter written twice.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/console-password",
        Type: "SecureString",
        Value: "first-password",
      },
    });
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/console-password",
        Value: "second-password",
        Overwrite: true,
      },
    });

    // When a template names the first version.
    const stack = await deployConsoleUser(
      simAws,
      "{{resolve:ssm-secure:/myapp/console-password:1}}",
    );

    // Then that version's value is decrypted rather than the current one.
    assertIdentical(consolePassword(stack), "first-password");
  });

  it("substitutes a reference sitting inside a longer string", async () => {
    // Given a SecureString parameter holding part of a password.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/console-password",
        Type: "SecureString",
        Value: "hunter2",
      },
    });

    // When a template wraps the reference in surrounding text.
    const stack = await deployConsoleUser(
      simAws,
      "prefix-{{resolve:ssm-secure:/myapp/console-password}}-suffix",
    );

    // Then only the reference is replaced.
    assertIdentical(consolePassword(stack), "prefix-hunter2-suffix");
  });

  it("resolves a reference whose name comes from an Fn::Sub variable", async () => {
    // Given a SecureString parameter under an environment-specific path.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/prod/console-password",
        Type: "SecureString",
        Value: "prod-password",
      },
    });

    // When the reference names it through an Fn::Sub variable.
    const stack = await deployConsoleUser(
      simAws,
      {
        "Fn::Sub":
          // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
          "{{resolve:ssm-secure:/myapp/${Environment}/console-password}}",
      },
      { Environment: { Type: "String", Default: "prod" } },
    );

    // Then the substituted name is what Parameter Store is asked for.
    assertIdentical(consolePassword(stack), "prod-password");
  });

  it("decrypts through the customer managed key the parameter names", async () => {
    // Given a SecureString parameter written under a key of its own.
    const simAws = simAwsInEuWest2();
    const key = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Description: "Console key" }));
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/console-password",
        Type: "SecureString",
        Value: "hunter2",
        KeyId: key.KeyMetadata?.Arn,
      },
    });

    // When a template reads it through an ssm-secure dynamic reference.
    const stack = await deployConsoleUser(
      simAws,
      "{{resolve:ssm-secure:/myapp/console-password}}",
    );

    // Then the deploying caller decrypted it with that key.
    assertIdentical(consolePassword(stack), "hunter2");
  });
});
