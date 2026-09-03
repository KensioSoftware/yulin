/**
 * A function skipped on its Runtime, and the Log Group named after it.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "ReportStack",
  template: {
    Resources: {
      ReportFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          Role: "arn:aws:iam::111111111111:role/ReportRole",
          Handler: "index.handler",
          Runtime: "python3.13",
          Code: { ZipFile: "def handler(event, context): return 'report'" },
        },
      },
      ReportFunctionLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: {
            "Fn::Join": ["", ["/aws/lambda/", { Ref: "ReportFunction" }]],
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.getResource("ReportFunction")?.refValue);
// "ReportStack-ReportFunction-42d643ca8338"

console.log(simAws.logs().allLogGroups()[0]?.logGroupName);
// "/aws/lambda/ReportStack-ReportFunction-42d643ca8338"
