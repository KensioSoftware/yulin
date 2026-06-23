/**
 * Deploy with sim CloudFormation, then serve the simulated resources on localhost.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "local-site-stack",
    template: {
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "local-site-bucket",
            WebsiteConfiguration: {
              IndexDocument: "index.html",
            },
          },
        },
      },
    },
  });

  await stack.waitForDeployComplete();

  await simAws.s3().putObject({
    input: {
      Bucket: "local-site-bucket",
      Key: "index.html",
      Body: "<h1>Hello from Sim CloudFormation</h1>",
      ContentType: "text/html; charset=utf-8",
    },
  });

  const websiteUrl = simAws.s3().getBucketWebsiteUrl("local-site-bucket");
  const response = await fetch(srv.localUrl(websiteUrl));

  console.log(response.status);
  console.log(await response.text());
} finally {
  srv.close();
}
