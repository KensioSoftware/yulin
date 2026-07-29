import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateSecretCommand,
  ListSecretsCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

describe("Secrets Manager ListSecrets authorization", () => {
  it("denies a policy naming individual secret ARNs", async () => {
    // Given a Role allowed to list secrets, but only against a named secret
    // ARN. Real Secrets Manager gives ListSecrets no resource-level
    // permissions, so such a policy grants nothing.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SecretReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SecretReader",
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "secretsmanager:ListSecrets",
            Resource:
              "arn:aws:secretsmanager:us-east-1:111111111111:secret:db-creds-??????",
          },
        }),
      }),
    );

    // When it lists secrets.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.secretsManager().listSecrets(new ListSecretsCommand({}), {
        caller: { kind: "arn", arn: role.Role.Arn },
      }),
    );

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows a policy granting the action on everything", async () => {
    // Given a Role allowed to list secrets on `*`.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "SecretReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SecretReader",
        PolicyName: "SecretPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "secretsmanager:ListSecrets", Resource: "*" },
        }),
      }),
    );
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
      );

    // When it lists secrets.
    const listed = await simAws
      .secretsManager()
      .listSecrets(new ListSecretsCommand({}), {
        caller: { kind: "arn", arn: role.Role.Arn },
      });

    // Then the list comes back.
    assertNonNullable(listed.SecretList);
    assertIdentical(listed.SecretList.at(0)?.Name, "db-creds");
  });
});
