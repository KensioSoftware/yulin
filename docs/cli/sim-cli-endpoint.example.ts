/**
 * Serving a simulated environment for the aws CLI to reach.
 */

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const simIam = simAws.iam();

await simIam.createUser(new CreateUserCommand({ UserName: "Operator" }));
await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "Operator",
    PolicyName: "Everything",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "*", Resource: "*" },
    }),
  }),
);
const created = await simIam.createAccessKey(
  new CreateAccessKeyCommand({ UserName: "Operator" }),
);

const srv = await serveSimAws({ simAws, port: 8787 });

// Paste these into the shell the CLI runs in.
console.log(`export AWS_ENDPOINT_URL=http://localhost:${srv.port}`);
console.log(`export AWS_ACCESS_KEY_ID=${created.AccessKey.AccessKeyId}`);
console.log(
  `export AWS_SECRET_ACCESS_KEY=${created.AccessKey.SecretAccessKey}`,
);
console.log(`export AWS_DEFAULT_REGION=${simAws.defaultRegionName}`);
