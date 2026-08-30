/**
 * Keeping backup vaults inside their account and Region.
 */

import {
  CreateBackupVaultCommand,
  ListBackupVaultsCommand,
} from "@aws-sdk/client-backup";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .account("111111111111")
  .region("eu-west-2")
  .backup()
  .createBackupVault(
    new CreateBackupVaultCommand({ BackupVaultName: "application-backups" }),
  );

const inLondon = await simAws
  .account("111111111111")
  .region("eu-west-2")
  .backup()
  .listBackupVaults(new ListBackupVaultsCommand({}));

const inVirginia = await simAws
  .account("111111111111")
  .region("us-east-1")
  .backup()
  .listBackupVaults(new ListBackupVaultsCommand({}));

console.log(inLondon.BackupVaultList?.length); // 1
console.log(inVirginia.BackupVaultList?.length); // 0
