/**
 * A simulated secret holding its name until the recovery window elapses.
 */

import {
  CreateSecretCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";
import { SimSecretsManagerInvalidRequestException } from "@kensio/yulin/secretsmanager";

const simAws = new SimAws();
const secretsManager = simAws.secretsManager();

await secretsManager.createSecret(
  new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
);

await secretsManager.deleteSecret(
  new DeleteSecretCommand({ SecretId: "db-creds", RecoveryWindowInDays: 7 }),
);

try {
  await secretsManager.createSecret(
    new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
  );
} catch (error) {
  // The name is still taken by the secret waiting out its window.
  console.log(error instanceof SimSecretsManagerInvalidRequestException); // true
}

await simAws.clock().advanceBy({ days: 8 });

// Now the secret is gone and the name is free again.
const recreated = await secretsManager.createSecret(
  new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
);

console.log(recreated.Name); // "db-creds"
