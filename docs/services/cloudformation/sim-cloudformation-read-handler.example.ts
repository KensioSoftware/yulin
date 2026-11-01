/**
 * An update refused because the deploy Role may not read an unchanged
 * resource whose attribute an output reads.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({
  defaultAccountId: "123456789012",
  defaultRegionName: "eu-west-2",
});

const deployer = await simAws.iam().makeDeployRole({
  roleName: "cdk-exec",
  policyDocument: {
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Action: [
        "s3:*",
        "codeartifact:CreateDomain",
        "codeartifact:CreateRepository",
        "codeartifact:DescribeRepository",
        "codeartifact:ListTagsForResource",
      ],
      Resource: "*",
    },
  },
});

const mirror = {
  Domain: {
    Type: "AWS::CodeArtifact::Domain",
    Properties: { DomainName: "example" },
  },
  Repository: {
    Type: "AWS::CodeArtifact::Repository",
    Properties: { DomainName: "example", RepositoryName: "npm" },
    DependsOn: "Domain",
  },
};
const outputs = {
  RepositoryArn: { Value: { "Fn::GetAtt": ["Repository", "Arn"] } },
};

const cloudFormation = simAws.cloudFormation();

await cloudFormation.deployTemplate({
  stackName: "artifacts",
  template: { Resources: mirror, Outputs: outputs },
  caller: deployer,
});

await cloudFormation.updateStack({
  input: {
    StackName: "artifacts",
    TemplateBody: JSON.stringify({
      Resources: { ...mirror, Sources: { Type: "AWS::S3::Bucket" } },
      Outputs: outputs,
    }),
  },
});

try {
  await cloudFormation.waitForStackUpdateComplete("artifacts");
} catch (error) {
  // "... is not authorized to perform:
  // codeartifact:GetRepositoryPermissionsPolicy on resource:
  // arn:aws:codeartifact:eu-west-2:123456789012:repository/example/npm"
  console.log((error as Error).message);
}
