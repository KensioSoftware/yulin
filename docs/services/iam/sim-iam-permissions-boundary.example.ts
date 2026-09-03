/**
 * Deploying into an account that requires a permissions boundary.
 */

import { GetRoleCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const boundaryArn = "arn:aws:iam::123456789012:policy/DeveloperBoundary";

const deployer = await simAws.iam().makeDeployRole({
  roleName: "cfn-exec",
  policyDocument: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "iam:CreateRole",
        Resource: "*",
        Condition: {
          StringEquals: { "iam:PermissionsBoundary": boundaryArn },
        },
      },
      {
        Effect: "Allow",
        Action: ["cloudformation:*", "iam:PutRolePolicy", "iam:PassRole"],
        Resource: "*",
      },
    ],
  },
});

const jobRoleTrust = {
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Action: "sts:AssumeRole",
    Principal: { Service: "lambda.amazonaws.com" },
  },
};

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "guarded-stack",
  template: {
    Resources: {
      JobRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "JobRole",
          PermissionsBoundary: boundaryArn,
          AssumeRolePolicyDocument: jobRoleTrust,
        },
      },
    },
  },
  caller: deployer,
});

// CREATE_COMPLETE
console.log(stack.getResource("JobRole")?.status);

const roleRead = await simAws
  .iam()
  .getRole(new GetRoleCommand({ RoleName: "JobRole" }));

// arn:aws:iam::123456789012:policy/DeveloperBoundary
console.log(roleRead.Role.PermissionsBoundary?.PermissionsBoundaryArn);

try {
  await simAws.cloudFormation().deployTemplate({
    stackName: "unguarded-stack",
    template: {
      Resources: {
        BareRole: {
          Type: "AWS::IAM::Role",
          Properties: {
            RoleName: "BareRole",
            AssumeRolePolicyDocument: jobRoleTrust,
          },
        },
      },
    },
    caller: deployer,
  });
} catch (error) {
  console.error("A Role declaring no boundary was refused", error);
}
