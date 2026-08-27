/**
 * Allowing only what the attached policies name.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const organizations = simAws.organizations();

organizations.detachFullAwsAccess("123456789012");
organizations.attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "dynamodb:*", Resource: "*" },
});

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
});

console.log(decision.value); // "ImplicitDeny"
console.log(decision.denialReason);
// "because no service control policy allows the s3:GetObject action"
