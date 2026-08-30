/**
 * A Role allowed to create one named backup vault.
 */

import { CreateBackupVaultCommand } from "@aws-sdk/client-backup";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "BackupAdministrator",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::888888888888:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "BackupAdministrator",
    PolicyName: "CreateApplicationVault",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "backup:CreateBackupVault",
        Resource:
          "arn:aws:backup:us-east-1:888888888888:backup-vault:application-backups",
      },
    }),
  }),
);

const created = await simAws.backup().createBackupVault(
  new CreateBackupVaultCommand({
    BackupVaultName: "application-backups",
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

console.log(created.BackupVaultName); // "application-backups"
