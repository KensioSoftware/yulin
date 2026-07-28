import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
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
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

interface SimAwsWithRole {
  readonly simAws: SimAws;
  readonly caller: SimAwsCaller;
}

async function simAwsWithRole(
  policyStatement: object,
): Promise<SimAwsWithRole> {
  const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
  const accountId = simAws.defaultAccountId;

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "SecretReader",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "SecretReader",
      PolicyName: "SecretPolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: policyStatement,
      }),
    }),
  );

  return {
    simAws,
    caller: { kind: "arn", arn: role.Role.Arn },
  };
}

describe("Secrets Manager IAM authorization", () => {
  it("allows a read the caller's policy permits", async () => {
    // Given a Role allowed to read any secret.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "secretsmanager:GetSecretValue",
      Resource: "*",
    });
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
      );

    // When it reads a secret.
    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }), {
        caller,
      });

    // Then the read succeeds.
    assertIdentical(read.SecretString, "hunter2");
  });

  it("denies a read the caller's policy does not permit", async () => {
    // Given a Role allowed only to describe secrets.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "secretsmanager:DescribeSecret",
      Resource: "*",
    });
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
      );

    // When it tries to read a secret's value.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }), {
          caller,
        }),
    );

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a policy written against the bare secret name", async () => {
    // Given a Role whose policy names the secret ARN without the six random
    // characters Secrets Manager appends, which is the mistake real policies
    // make.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "secretsmanager:GetSecretValue",
      Resource: "arn:aws:secretsmanager:us-east-1:111111111111:secret:db-creds",
    });
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
      );

    // When it tries to read the secret.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }), {
          caller,
        }),
    );

    // Then it is denied, exactly as it would be on real AWS.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows a policy using the six wildcard characters", async () => {
    // Given a Role whose policy ends the secret ARN in `-??????`, which is how
    // such a policy has to be written.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "secretsmanager:GetSecretValue",
      Resource:
        "arn:aws:secretsmanager:us-east-1:111111111111:secret:db-creds-??????",
    });
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
      );

    // When it reads the secret.
    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }), {
        caller,
      });

    // Then it is allowed.
    assertIdentical(read.SecretString, "hunter2");
  });

  it("denies creating a secret the caller may not create", async () => {
    // Given a Role allowed to create only secrets whose name starts with app/.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "secretsmanager:CreateSecret",
      Resource: "arn:aws:secretsmanager:us-east-1:111111111111:secret:app/*",
    });

    // When it creates one outside that prefix.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .createSecret(
          new CreateSecretCommand({ Name: "other", SecretString: "hunter2" }),
          { caller },
        ),
    );

    // Then it is denied, and one inside the prefix is allowed.
    assertInstanceOf(error, SimIamAccessDenied);

    const created = await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "app/db", SecretString: "hunter2" }),
        { caller },
      );
    assertNonNullable(created.ARN);
  });

  it("denies deleting a secret the caller may only read", async () => {
    // Given a Role allowed to read but not delete.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "secretsmanager:GetSecretValue",
      Resource: "*",
    });
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
      );

    // When it tries to delete the secret.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .deleteSecret(new DeleteSecretCommand({ SecretId: "db-creds" }), {
          caller,
        }),
    );

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});

describe("Secrets Manager ListSecrets authorization", () => {
  it("denies a policy naming individual secret ARNs", async () => {
    // Given a Role allowed to list secrets, but only against a named secret
    // ARN. Real Secrets Manager gives ListSecrets no resource-level
    // permissions, so such a policy grants nothing.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "secretsmanager:ListSecrets",
      Resource:
        "arn:aws:secretsmanager:us-east-1:111111111111:secret:db-creds-??????",
    });

    // When it lists secrets.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .secretsManager()
        .listSecrets(new ListSecretsCommand({}), { caller }),
    );

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows a policy granting the action on everything", async () => {
    // Given a Role allowed to list secrets on `*`.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "secretsmanager:ListSecrets",
      Resource: "*",
    });
    await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
      );

    // When it lists secrets.
    const listed = await simAws
      .secretsManager()
      .listSecrets(new ListSecretsCommand({}), { caller });

    // Then the list comes back.
    assertNonNullable(listed.SecretList);
    assertIdentical(listed.SecretList.at(0)?.Name, "db-creds");
  });
});
