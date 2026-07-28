/**
 * Reading a hierarchy of simulated parameters as application configuration.
 */

import {
  GetParametersByPathCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ssm = simAws.ssm();

await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);
await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-port",
    Type: "String",
    Value: "5432",
  }),
);
await ssm.putParameter(
  new PutParameterCommand({
    Name: "/myapp/test/db-host",
    Type: "String",
    Value: "db.test.internal",
  }),
);

const listed = await ssm.getParametersByPath(
  new GetParametersByPathCommand({ Path: "/myapp/prod" }),
);

console.log(listed.Parameters?.map((parameter) => parameter.Name));
// [ "/myapp/prod/db-host", "/myapp/prod/db-port" ]
