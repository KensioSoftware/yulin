/**
 * A deploy Role refused the cache policy its Stack declares.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// A deploy Role allowed CloudFormation and S3, and no CloudFront action.
const { Role } = await simAws.iam().createRole({
  input: {
    RoleName: "DeployRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "cloudformation.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  },
});

await simAws.iam().putRolePolicy({
  input: {
    RoleName: "DeployRole",
    PolicyName: "DeployPolicy",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["cloudformation:*", "s3:*"],
          Resource: "*",
        },
      ],
    }),
  },
});

try {
  await simAws.cloudFormation().deployTemplate({
    stackName: "site-stack",
    caller: { kind: "arn", arn: Role.Arn },
    template: {
      Resources: {
        SiteCachePolicy: {
          Type: "AWS::CloudFront::CachePolicy",
          Properties: {
            CachePolicyConfig: {
              Name: "site-caching",
              MinTTL: 0,
              ParametersInCacheKeyAndForwardedToOrigin: {
                EnableAcceptEncodingGzip: false,
                CookiesConfig: { CookieBehavior: "none" },
                HeadersConfig: { HeaderBehavior: "none" },
                QueryStringsConfig: { QueryStringBehavior: "none" },
              },
            },
          },
        },
      },
    },
  });
} catch (error) {
  // Sim CloudFormation Resource SiteCachePolicy creation failed: User:
  // arn:aws:iam::...:role/DeployRole is not authorized to perform:
  // cloudfront:CreateCachePolicy on resource: *
  console.log((error as Error).message);
}
