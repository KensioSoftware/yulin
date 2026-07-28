/**
 * Creating a simulated secret and reading it back.
 */

import {
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const secretsManager = simAws.secretsManager();

await secretsManager.createSecret(
  new CreateSecretCommand({
    Name: "db-creds",
    SecretString: JSON.stringify({ username: "app", password: "hunter2" }),
  }),
);

const read = await secretsManager.getSecretValue(
  new GetSecretValueCommand({ SecretId: "db-creds" }),
);

const credentials = JSON.parse(read.SecretString ?? "{}") as {
  password?: string;
};

console.log(credentials.password); // "hunter2"
