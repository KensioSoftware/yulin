# Simulated Organizations

Yulin simulates AWS Organizations service control policies. A test can find out that the
organization around an account forbids something before a deployment does.

A service control policy filters what an account's principals may do and grants nothing. Policies
attach to the organization root, to an organizational unit, or to one account, and an account
inherits every policy on the path down to it. Sim IAM evaluates them ahead of that account's
identity and resource policies. An SCP therefore applies to a CloudFormation deployment, an
intercepted SDK client, and a direct service call alike.

## Attach a policy to an organizational unit

A policy is usually attached to an organizational unit rather than to one account, and every account
under that unit inherits it. Units nest, and the root sits above all of them.

```typescript sim-organizations-organizational-unit
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
```

The policy hangs two levels above the account and still reaches it. `createOrganizationalUnit` takes
a parent unit as its second argument, and leaves the unit under the root without one.
`organizations.root()` is the node above everything, and a policy attached there covers every
account in the organization.

## Every level has to allow the action

An account is filtered by each node on the path from the root down to it, and each one has to allow
an action on its own. A root allowing S3 and a unit allowing DynamoDB leave an account beneath them
able to do neither.

```typescript sim-organizations-every-level-allows
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
```

`unallowedLevels` names the nodes that allowed nothing matching. That is the part of a real SCP
denial that takes longest to track down.

A `Deny` at any level ends the request whatever another level allows.

## The management account

`setManagementAccount` names the account AWS exempts from every service control policy. That account
is decided by its identity and resource policies alone, whatever is attached above it.

```typescript sim-organizations-management-account
/**
 * Exempting the management account.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const organizations = simAws.organizations();

organizations.attachServiceControlPolicy(organizations.root(), {
  Version: "2012-10-17",
  Statement: { Effect: "Deny", Action: "*", Resource: "*" },
});
organizations.setManagementAccount("111111111111");

const decision = simAws.account("111111111111").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::reports-bucket",
});

console.log(decision.isAllowed); // true
console.log(decision.serviceControlPolicy.isApplied); // false
```

## Attach a service control policy to an Account

A policy attached straight to an account applies to that account alone. An organization spans
accounts, so it belongs to the whole simulated environment and is reached as
`simAws.organizations()`, not from an account scope.

```typescript sim-organizations-attach-scp
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
```

The account also gets AWS's own `FullAWSAccess` policy, as it would in a real organization. One
`Deny` statement therefore denies that one action and leaves the rest of the account working.

An account with no policy attached to it stays outside the organization's reach, and its identity
and resource policies decide its requests as they did before.

## Catch a deployment the policy denies

Sim CloudFormation creates each resource through the owning service's command handler, and that
handler authorizes. A deployment carries no caller, so IAM decides it as the account root, and an
SCP applies to a member account's root the same way AWS does.

```typescript sim-organizations-scp-deployment
/**
 * A CloudFormation Resource a service control policy denies.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
});

try {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "reports-stack",
    template: {
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports-bucket" },
        },
      },
    },
  });

  await stack.waitForDeployComplete();
} catch (error) {
  // "... is not authorized to perform: s3:CreateBucket on resource:
  //  arn:aws:s3:::reports-bucket with an explicit deny in a service control policy"
  console.log((error as Error).message);
}

const failed = simAws
  .cloudFormation()
  .getStackByName("reports-stack")
  ?.getResource("ReportsBucket");

console.log(failed?.status); // "CREATE_FAILED"
```

The resource is left `CREATE_FAILED` and the deployment rejects. A test asserting that a stack
deploys then fails on the policy, with the policy named in the message.

## Write an allow list instead of a deny list

`detachFullAwsAccess` takes AWS's own policy off an account. What remains has to allow an action
for the account to be allowed it. That is an organization run as an allow list.

```typescript sim-organizations-scp-allow-list
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
```

An account root holds unrestricted access in sim IAM, and this denies it anyway. That is what an
SCP does in AWS, and it is why an allow list is worth writing in a test at all.

Detaching `FullAWSAccess` on its own leaves the account holding no policy, and every action is then
denied. AWS behaves the same way, and warns about it.

## Reading a denial

An authorization decision reports the organization's verdict apart from the identity and resource
sides, through `decision.serviceControlPolicy`:

| Property          | Meaning                                                     |
| ----------------- | ----------------------------------------------------------- |
| `isApplied`       | Whether any service control policy applied to the request.  |
| `isDenied`        | Whether the attached policies denied it, either way.        |
| `isExplicitDeny`  | Whether a matching `Deny` statement denied it.              |
| `isImplicitDeny`  | Whether the attached policies produced no matching `Allow`. |
| `denyStatements`  | The matching `Deny` statements.                             |
| `allowStatements` | The matching `Allow` statements.                            |

`decision.denialReason` carries the wording AWS puts on the `AccessDenied` message, and every
simulated service passes it through to the error it throws.

`simAws.organizations().serviceControlPoliciesFor(accountId)` returns the policies in force for an
account, in the order they were evaluated, including `FullAWSAccess` where it is still attached.

`serviceControlPolicySetFor(accountId).levels` keeps the policies grouped by the node they hang on,
root first. That grouping is what sim IAM evaluates.

The flattened list is empty in two cases that behave differently. An account that was never named
sits outside the organization and stays unrestricted. An account left holding no policy is denied
everything.
`serviceControlPolicySetFor(accountId).applies` tells the two apart, and so does
`decision.serviceControlPolicy.isApplied`.

## Available functionality

Simulated Organizations supports:

- `createOrganizationalUnit`, creating a unit under the root or under another unit
- `moveAccount`, putting an Account under a unit or under the root
- `root`, the node above every Account in the organization
- `setManagementAccount`, exempting the Account AWS exempts
- `attachServiceControlPolicy`, attaching a policy document to the root, a unit, or an Account
- `detachFullAwsAccess`, turning a node's policies into an allow list
- `detachServiceControlPolicies`, taking every policy back off a node
- `serviceControlPoliciesFor`, reading the policies in force for an Account
- `serviceControlPolicySetFor`, reading those policies along with whether any apply
- The AWS-managed `FullAWSAccess` policy, attached by default as it is in AWS
- Evaluation ahead of identity and resource policies, for every principal in the Account including
  its root
- Inheritance down the root-to-Account path, with every level having to allow the action
- AWS-shaped `r-` and `ou-` node ids
- `Action`, `NotAction`, `Resource`, `NotResource` and `Condition` in an SCP statement
- The `ArnEquals`, `ArnLike`, `NumericLessThanEquals`, `StringEquals` and `StringLike` condition
  operators, and their `ForAnyValue:` and `ForAllValues:` set forms
- `AccessDenied` messages naming the service control policy, as AWS words them
- Denial reporting through `decision.serviceControlPolicy`, naming the levels that allowed nothing

## Limitations

| Limitation                  | Detail                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Management account          | Named with `setManagementAccount`. An organization with none named exempts no Account.                                              |
| Moving an Account           | `moveAccount` places an Account and can move it again. Nothing records where it was before.                                         |
| Service-linked roles        | Evaluated like any other principal. AWS exempts a service-linked role from SCPs.                                                    |
| Other policy types          | Resource control policies, declarative policies, tag policies, backup policies and AI services opt-out policies are not simulated.  |
| The Organizations SDK       | `CreatePolicy`, `AttachPolicy`, `ListAccounts` and the rest of the API are not handled. Policies are attached through the accessor. |
| CloudFormation              | `AWS::Organizations::Organization`, `::OrganizationalUnit`, `::Account` and `::Policy` are not created from a template.             |
| Organization condition keys | `aws:PrincipalOrgID` and `aws:PrincipalOrgPaths` are not populated. A condition naming either fails to match.                       |
| Service principals          | A request whose caller is a service principal or anonymous belongs to no Account and is subject to no policy.                       |
| Condition operator coverage | An operator sim IAM does not know fails closed, so the statement holding it never matches.                                          |
| HTTP API                    | Organizations is not served as an HTTP API by `serveSimAws`.                                                                        |
