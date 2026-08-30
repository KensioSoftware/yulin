import {
  CreateBackupVaultCommand,
  DescribeBackupVaultCommand,
  ListBackupVaultsCommand,
} from "@aws-sdk/client-backup";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimBackupAccessDeniedException } from "../error/sim-backup.error.js";

async function simAwsWithRole(
  statement: object,
): Promise<{ readonly simAws: SimAws; readonly caller: SimAwsCaller }> {
  const simAws = new SimAws();
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "BackupAdministrator",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "BackupAdministrator",
      PolicyName: "ManageBackup",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );
  return { simAws, caller: { kind: "arn", arn: role.Role.Arn } };
}

describe("AWS Backup IAM authorization", () => {
  it("authorizes a vault command against the vault ARN", async () => {
    // Given a Role allowed to create one named vault.
    const vaultName = "permitted-vault";
    const vaultArn = `arn:aws:backup:us-east-1:888888888888:backup-vault:${vaultName}`;
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "backup:CreateBackupVault",
      Resource: vaultArn,
    });

    // When it creates that vault.
    const created = await simAws
      .backup()
      .createBackupVault(
        new CreateBackupVaultCommand({ BackupVaultName: vaultName }),
        { caller },
      );

    // Then the command is allowed for the exact ARN.
    assertIdentical(created.BackupVaultArn, vaultArn);
  });

  it("refuses an unauthorized read before looking up the vault", async () => {
    // Given a Role with no permission to describe vaults.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "backup:CreateBackupVault",
      Resource: "*",
    });

    // When it describes a vault that is absent.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .backup()
        .describeBackupVault(
          new DescribeBackupVaultCommand({ BackupVaultName: "missing" }),
          { caller },
        );
    });

    // Then authorization fails before resource lookup.
    assertInstanceOf(error, SimBackupAccessDeniedException);
  });

  it("authorizes ListBackupVaults against every resource", async () => {
    // Given a Role whose list permission names one vault ARN.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "backup:ListBackupVaults",
      Resource: "arn:aws:backup:us-east-1:888888888888:backup-vault:one-vault",
    });

    // When it lists vaults.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.backup().listBackupVaults(new ListBackupVaultsCommand({}), {
        caller,
      });
    });

    // Then the resource-scoped permission does not match the list action.
    assertInstanceOf(error, SimBackupAccessDeniedException);
  });
});
