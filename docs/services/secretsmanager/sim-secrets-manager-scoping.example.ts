/**
 * Simulated secrets are scoped to an account and region.
 */

import {
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";
import { SimSecretsManagerResourceNotFoundException } from "@kensio/yulin/secretsmanager";

const simAws = new SimAws();

await simAws
  .account("222222222222")
  .region("eu-west-2")
  .secretsManager()
  .createSecret(
    new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
  );

try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .secretsManager()
    .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }));
} catch (error) {
  console.log(error instanceof SimSecretsManagerResourceNotFoundException); // true
}
