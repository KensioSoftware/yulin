import { CreateKeyCommand } from "@aws-sdk/client-kms";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

/**
 * Deploy a console User whose password is the value under test, returning
 * whatever the deployment failed with.
 */
async function deployConsoleUserFailure(
  simAws: SimAws,
  password: SimCfnTemplateValue,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () =>
    simAws.cloudFormation().deployTemplate({
      stackName: "console-stack",
      template: {
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
    }),
  );
}

describe("SSM CloudFormation ssm-secure dynamic references CloudFormation refuses", () => {
  it("fails a Resource whose property is off the documented list", async () => {
    // Given a SecureString parameter a template could have read.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: { Name: "/myapp/token", Type: "SecureString", Value: "hunter2" },
    });

    // When a queue tag reads it, which real CloudFormation refuses.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "queue-stack",
        template: {
          Resources: {
            Queue: {
              Type: "AWS::SQS::Queue",
              Properties: {
                QueueName: "work",
                Tags: [
                  {
                    Key: "owner",
                    Value: "{{resolve:ssm-secure:/myapp/token}}",
                  },
                ],
              },
            },
          },
        },
      }),
    );

    // Then the deployment fails, naming the property that held the reference.
    assertStringIncludes(error.message, "Tags[0].Value");
    assertStringIncludes(error.message, "AWS::SQS::Queue");
    assertStringIncludes(error.message, "eleven Resource properties");
  });

  it("fails a Resource whose property belongs to another Resource type", async () => {
    // Given a SecureString parameter a template could have read.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: { Name: "/myapp/token", Type: "SecureString", Value: "hunter2" },
    });

    // When a queue reads it into a property another Resource type does accept
    // an ssm-secure reference in.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "queue-stack",
        template: {
          Resources: {
            Queue: {
              Type: "AWS::SQS::Queue",
              Properties: {
                QueueName: "work",
                MasterUserPassword: "{{resolve:ssm-secure:/myapp/token}}",
              },
            },
          },
        },
      }),
    );

    // Then the list is read per Resource type rather than per property name.
    assertStringIncludes(error.message, "MasterUserPassword");
    assertStringIncludes(error.message, "eleven Resource properties");
  });

  it("fails a Resource whose reference names a String parameter", async () => {
    // Given a parameter stored in the clear.
    const simAws = simAwsInEuWest2();
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/console-password",
        Type: "String",
        Value: "hunter2",
      },
    });

    // When an ssm-secure reference reads it.
    const error = await deployConsoleUserFailure(
      simAws,
      "{{resolve:ssm-secure:/myapp/console-password}}",
    );

    // Then it is refused, as real CloudFormation refuses it.
    assertStringIncludes(error.message, "is a String parameter");
    assertStringIncludes(error.message, "reads a SecureString");
  });

  it("fails a Resource whose deploying caller cannot decrypt the key", async () => {
    // Given a key its Account may encrypt with and not decrypt with.
    const simAws = simAwsInEuWest2();
    const key = await simAws.kms().createKey(
      new CreateKeyCommand({
        Description: "Console key",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "Encrypt only",
              Effect: "Allow",
              Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
              Action: "kms:Encrypt",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    // And a SecureString parameter written under it.
    await simAws.ssm().putParameter({
      input: {
        Name: "/myapp/console-password",
        Type: "SecureString",
        Value: "hunter2",
        KeyId: key.KeyMetadata?.Arn,
      },
    });

    // When a template reads it through an ssm-secure dynamic reference.
    const error = await deployConsoleUserFailure(
      simAws,
      "{{resolve:ssm-secure:/myapp/console-password}}",
    );

    // Then the Resource fails the way a decrypting GetParameter fails, rather
    // than being created with something that is not the password.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
