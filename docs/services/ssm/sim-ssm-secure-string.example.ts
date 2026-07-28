/**
 * Writing and reading a simulated SecureString parameter.
 */

import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-password",
    Type: "SecureString",
    Value: "hunter2",
  }),
);

const encrypted = await ssm.getParameter(
  new GetParameterCommand({ Name: "/myapp/prod/db-password" }),
);

console.log(encrypted.Parameter?.Value); // a base64 ciphertext, not "hunter2"

const decrypted = await ssm.getParameter(
  new GetParameterCommand({
    Name: "/myapp/prod/db-password",
    WithDecryption: true,
  }),
);

console.log(decrypted.Parameter?.Value); // "hunter2"
