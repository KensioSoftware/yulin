/**
 * Staging labels moving as a simulated secret is rotated by hand.
 */

import {
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const secretsManager = simAws.secretsManager();

await secretsManager.createSecret(
  new CreateSecretCommand({ Name: "api-key", SecretString: "old-key" }),
);

await secretsManager.putSecretValue(
  new PutSecretValueCommand({ SecretId: "api-key", SecretString: "new-key" }),
);

const current = await secretsManager.getSecretValue(
  new GetSecretValueCommand({ SecretId: "api-key" }),
);
const previous = await secretsManager.getSecretValue(
  new GetSecretValueCommand({
    SecretId: "api-key",
    VersionStage: "AWSPREVIOUS",
  }),
);

console.log(current.SecretString); // "new-key"
console.log(previous.SecretString); // "old-key"
