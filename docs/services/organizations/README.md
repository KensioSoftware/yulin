# Simulated Organizations

Yulin simulates AWS Organizations service control policies. A test can find out that the
organization around an account forbids something before a deployment does.

A service control policy filters what an account's principals may do and grants nothing. Sim IAM
evaluates the ones attached to an account ahead of that account's identity and resource policies,
which means an SCP applies to a CloudFormation deployment, an intercepted SDK client, and a direct
service call alike.

## Attach a service control policy to an Account

An organization spans accounts. It belongs to the whole simulated environment and is reached as
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

An account nothing is attached to is outside the organization's reach, and its identity and
resource policies decide its requests as they did before.

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
for the account to be allowed it, which is an organization run as an allow list.

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

## Available functionality

Simulated Organizations supports:

- `attachServiceControlPolicy`, attaching a policy document to a simulated Account
- `detachFullAwsAccess`, turning an Account's policies into an allow list
- `detachServiceControlPolicies`, putting an Account back outside the organization's reach
- `serviceControlPoliciesFor`, reading the policies in force for an Account
- The AWS-managed `FullAWSAccess` policy, attached by default as it is in AWS
- Evaluation ahead of identity and resource policies, for every principal in the Account including
  its root
- `Action`, `NotAction`, `Resource`, `NotResource` and `Condition` in an SCP statement
- The `ArnEquals`, `ArnLike`, `NumericLessThanEquals`, `StringEquals` and `StringLike` condition
  operators, and their `ForAnyValue:` and `ForAllValues:` set forms
- `AccessDenied` messages naming the service control policy, as AWS words them
- Denial reporting through `decision.serviceControlPolicy`

## Limitations

| Limitation                  | Detail                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization structure      | Policies attach to an Account directly. Roots, organizational units and inheritance down a tree are not simulated.                                             |
| Management account          | No Account is designated the management account, so no Account is exempt from evaluation. Attach nothing to an Account that stands for the management account. |
| Service-linked roles        | Evaluated like any other principal. AWS exempts a service-linked role from SCPs.                                                                               |
| Other policy types          | Resource control policies, declarative policies, tag policies, backup policies and AI services opt-out policies are not simulated.                             |
| The Organizations SDK       | `CreatePolicy`, `AttachPolicy`, `ListAccounts` and the rest of the API are not handled. Policies are attached through the accessor.                            |
| CloudFormation              | `AWS::Organizations::Organization`, `::OrganizationalUnit`, `::Account` and `::Policy` are not created from a template.                                        |
| Organization condition keys | `aws:PrincipalOrgID` and `aws:PrincipalOrgPaths` are not populated. A condition naming either fails to match.                                                  |
| Service principals          | A request whose caller is a service principal or anonymous belongs to no Account and is subject to no policy.                                                  |
| Condition operator coverage | An operator sim IAM does not know fails closed, so the statement holding it never matches.                                                                     |
| HTTP API                    | Organizations is not served as an HTTP API by `serveSimAws`.                                                                                                   |
