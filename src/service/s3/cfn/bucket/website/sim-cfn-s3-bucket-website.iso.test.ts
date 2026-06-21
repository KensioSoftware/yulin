import {
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";

describe("S3 CloudFormation Bucket WebsiteConfiguration", () => {
  it("configures an index document from AWS::S3::Bucket WebsiteConfiguration", async () => {
    // Given a CloudFormation template declaring an S3 Bucket with website
    // configuration.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    await simAws.cloudFormation().deployTemplate({
      stackName: "website-stack",
      template: {
        Resources: {
          WebsiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "website-config-bucket",
              WebsiteConfiguration: {
                IndexDocument: {
                  Suffix: "index.html",
                },
              },
            },
          },
        },
      },
    });

    // Then static website hosting is configured on the simulated S3 Bucket.
    const bucket = simAws.s3().getSimBucketByName("website-config-bucket");

    assertNonNullable(bucket);
    assertTrue(bucket.getWebsite().websiteEnabled());
    assertIdentical(
      bucket.getWebsite().objectKeyForRequest("docs/"),
      "docs/index.html",
    );
  });

  it("configures an error document from AWS::S3::Bucket WebsiteConfiguration", async () => {
    // Given a CloudFormation template declaring an S3 Bucket with an error
    // document website configuration.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    await simAws.cloudFormation().deployTemplate({
      stackName: "error-website-stack",
      template: {
        Resources: {
          WebsiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "error-website-config-bucket",
              WebsiteConfiguration: {
                ErrorDocument: {
                  Key: "error.html",
                },
              },
            },
          },
        },
      },
    });

    // Then the error document is configured on the simulated S3 Bucket.
    const bucket = simAws
      .s3()
      .getSimBucketByName("error-website-config-bucket");

    assertNonNullable(bucket);
    assertTrue(bucket.getWebsite().websiteEnabled());
    assertIdentical(bucket.getWebsite().errorDocumentKey(), "error.html");
  });

  it("configures redirect all requests from AWS::S3::Bucket WebsiteConfiguration", async () => {
    // Given a CloudFormation template declaring an S3 Bucket that redirects all
    // website requests.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    await simAws.cloudFormation().deployTemplate({
      stackName: "redirect-website-stack",
      template: {
        Resources: {
          WebsiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "redirect-website-config-bucket",
              WebsiteConfiguration: {
                RedirectAllRequestsTo: {
                  HostName: "example.test",
                  Protocol: "https",
                },
              },
            },
          },
        },
      },
    });

    // Then redirect-all-requests website hosting is configured.
    const bucket = simAws
      .s3()
      .getSimBucketByName("redirect-website-config-bucket");

    assertNonNullable(bucket);
    assertTrue(bucket.getWebsite().websiteEnabled());
    assertTrue(bucket.getWebsite().redirectsAllRequests());
  });

  it("configures routing rules from AWS::S3::Bucket WebsiteConfiguration", async () => {
    // Given a CloudFormation template declaring an S3 Bucket with website routing
    // rules.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    await simAws.cloudFormation().deployTemplate({
      stackName: "routing-rules-website-stack",
      template: {
        Resources: {
          WebsiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "routing-rules-website-config-bucket",
              WebsiteConfiguration: {
                RoutingRules: [
                  {
                    Condition: {
                      HttpErrorCodeReturnedEquals: "404",
                    },
                    Redirect: {
                      ReplaceKeyWith: "not-found.html",
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });

    // Then the routing rule is configured on the simulated S3 Bucket website.
    const bucket = simAws
      .s3()
      .getSimBucketByName("routing-rules-website-config-bucket");

    assertNonNullable(bucket);

    const res = bucket
      .getWebsite()
      .redirectForRequestResponse(
        new Request(
          "http://routing-rules-website-config-bucket.s3-website.localhost/missing.html",
        ),
        new Response("Missing", { status: 404 }),
      );

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "http://routing-rules-website-config-bucket.s3-website.localhost/not-found.html",
    );
  });

  it("configures a CloudFormation string index document from AWS::S3::Bucket WebsiteConfiguration", async () => {
    // Given a CloudFormation template using the AWS::S3::Bucket
    // WebsiteConfiguration shape emitted by CDK.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    await simAws.cloudFormation().deployTemplate({
      stackName: "website-string-index-stack",
      template: {
        Resources: {
          WebsiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "website-string-index-config-bucket",
              WebsiteConfiguration: {
                IndexDocument: "index.html",
              },
            },
          },
        },
      },
    });

    // Then static website hosting is configured on the simulated S3 Bucket.
    const bucket = simAws
      .s3()
      .getSimBucketByName("website-string-index-config-bucket");

    assertNonNullable(bucket);
    assertTrue(bucket.getWebsite().websiteEnabled());
    assertIdentical(
      bucket.getWebsite().objectKeyForRequest("docs/"),
      "docs/index.html",
    );
  });
});
