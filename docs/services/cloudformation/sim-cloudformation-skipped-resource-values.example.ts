/**
 * The stand-in values a skipped CloudFormation Resource answers with.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "stand-in-stack",
  template: {
    Resources: {
      SearchApi: {
        Type: "AWS::AppSync::GraphQLApi",
        Properties: {
          Name: "search",
        },
      },
    },
    Outputs: {
      SearchApiRef: { Value: { Ref: "SearchApi" } },
      SearchApiArn: { Value: { "Fn::GetAtt": ["SearchApi", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.output("SearchApiRef"));
// "SearchApi"

console.log(stack.output("SearchApiArn"));
// "SearchApi.Arn"

for (const skipped of stack.skippedResources) {
  console.log(skipped.logicalId, skipped.skippedReason);
  // "SearchApi Unsupported sim CloudFormation Resource service AppSync"
}
