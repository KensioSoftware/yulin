/**
 * Simulated IAM Account scoping.
 */

import { CreateUserCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const firstAccountIam = simAws.account("111111111111").iam();
const secondAccountIam = simAws.account("222222222222").iam();

const firstUserOutput = await firstAccountIam.createUser(
  new CreateUserCommand({ UserName: "DeployUser" }),
);
const secondUserOutput = await secondAccountIam.createUser(
  new CreateUserCommand({ UserName: "DeployUser" }),
);

console.log(firstUserOutput.User.Arn);
console.log(secondUserOutput.User.Arn);
