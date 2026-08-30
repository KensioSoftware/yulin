/**
 * Routing an AWS Backup client into the simulation.
 */

import {
  BackupClient,
  CreateBackupVaultCommand,
  ListBackupVaultsCommand,
} from "@aws-sdk/client-backup";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
const client = new BackupClient({ region: "us-east-1" });
simSdk.intercept(client);

await client.send(
  new CreateBackupVaultCommand({ BackupVaultName: "application-backups" }),
);

const listed = await client.send(new ListBackupVaultsCommand({}));
console.log(listed.BackupVaultList?.[0]?.BackupVaultName);
// "application-backups"
