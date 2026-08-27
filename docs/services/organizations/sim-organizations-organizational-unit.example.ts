/**
 * Inheriting a service control policy from an organizational unit.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const organizations = simAws.organizations();

const workloads = organizations.createOrganizationalUnit("Workloads");
const production = organizations.createOrganizationalUnit(
  "Production",
  workloads,
);

organizations.moveAccount("123456789012", production);
organizations.attachServiceControlPolicy(workloads, {
  Version: "2012-10-17",
  Statement: { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
});

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::reports-bucket",
});

console.log(decision.value); // "ExplicitDeny"
