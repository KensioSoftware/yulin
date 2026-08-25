/**
 * An AWS::Athena::WorkGroup deployed from a template and read back.
 */

import { AthenaClient, GetWorkGroupCommand } from "@aws-sdk/client-athena";

import { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rainlytics",
  template: {
    Resources: {
      Queries: {
        Type: "AWS::Athena::WorkGroup",
        Properties: {
          Name: "rainlytics",
          Description: "CloudFront access log queries",
          WorkGroupConfiguration: {
            BytesScannedCutoffPerQuery: 10_000_000_000,
            EnforceWorkGroupConfiguration: true,
            ResultConfiguration: {
              OutputLocation: "s3://rainlytics-results/queries/",
            },
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

using simSdk = new SimSdk({ simAws });
simSdk.intercept(AthenaClient);

const athena = new AthenaClient({});
const read = await athena.send(
  new GetWorkGroupCommand({ WorkGroup: "rainlytics" }),
);

// 10000000000
console.log(read.WorkGroup?.Configuration?.BytesScannedCutoffPerQuery);
