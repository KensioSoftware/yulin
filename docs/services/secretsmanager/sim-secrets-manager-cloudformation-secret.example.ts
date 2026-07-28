/**
 * Deploying a secret from a CloudFormation template and reading back the
 * password the deployment generated.
 */

import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "database-stack",
  template: {
    Resources: {
      DbSecret: {
        Type: "AWS::SecretsManager::Secret",
        Properties: {
          Name: "db-credentials",
          Description: "Credentials for the application database",
          GenerateSecretString: {
            SecretStringTemplate: JSON.stringify({ username: "app" }),
            GenerateStringKey: "password",
            PasswordLength: 24,
            ExcludePunctuation: true,
          },
        },
      },
    },
    Outputs: {
      DbSecretArn: {
        Value: { Ref: "DbSecret" },
      },
    },
  },
});

await stack.waitForDeployComplete();

// Ref resolves to the ARN including its suffix, so it works as a SecretId.
const secretArn = stack.outputs.get("DbSecretArn")?.value as string;

const read = await simAws
  .secretsManager()
  .getSecretValue(new GetSecretValueCommand({ SecretId: secretArn }));

const credentials = JSON.parse(read.SecretString ?? "{}") as {
  username?: string;
  password?: string;
};

console.log(credentials.username); // "app"
console.log(credentials.password?.length); // 24
