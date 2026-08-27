/**
 * Denying an action with a simulated service control policy.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyBucketCreation",
    Effect: "Deny",
    Action: "s3:CreateBucket",
    Resource: "*",
  },
});

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::reports-bucket",
});

console.log(decision.value); // "ExplicitDeny"
console.log(decision.serviceControlPolicy.isDenied); // true
console.log(decision.serviceControlPolicy.denyStatements[0]?.Sid); // "DenyBucketCreation"
