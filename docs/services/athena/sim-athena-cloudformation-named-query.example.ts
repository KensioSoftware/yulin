/**
 * An AWS::Athena::NamedQuery registering a rollup against a workgroup.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rainlytics",
  template: {
    Resources: {
      Queries: {
        Type: "AWS::Athena::WorkGroup",
        Properties: { Name: "rainlytics" },
      },
      Pageviews: {
        Type: "AWS::Athena::NamedQuery",
        Properties: {
          Name: "pageviews",
          Database: "rainlytics",
          QueryString:
            "SELECT cs_uri_stem, count(*) FROM access_logs GROUP BY 1",
          WorkGroup: { Ref: "Queries" },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const listed = await simAws
  .athena()
  .listNamedQueries({ input: { WorkGroup: "rainlytics" } });

// 1
console.log(listed.NamedQueryIds?.length);
