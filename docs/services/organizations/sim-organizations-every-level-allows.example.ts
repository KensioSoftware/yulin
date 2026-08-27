/**
 * Each level of the organization allowing the action separately.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const organizations = simAws.organizations();
const workloads = organizations.createOrganizationalUnit("Workloads");

organizations.moveAccount("123456789012", workloads);

organizations.detachFullAwsAccess(organizations.root());
organizations.attachServiceControlPolicy(organizations.root(), {
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
});

organizations.detachFullAwsAccess(workloads);
organizations.attachServiceControlPolicy(workloads, {
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "dynamodb:*", Resource: "*" },
});

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
});

console.log(decision.value); // "ImplicitDeny"
console.log(decision.serviceControlPolicy.unallowedLevels); // [ "Workloads" ]
