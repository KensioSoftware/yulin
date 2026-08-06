/**
 * Serving CDK BucketDeployment files through simulated S3.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  await simAws
    .cloudFormation()
    .deployTemplateFile("cdk.out/TestStack.template.json");

  const response = await fetch(
    `http://foo-bucket.s3-website.us-east-1.sim-aws.localhost:${srv.port}/`,
  );

  console.log(response.status);
  console.log(await response.text());
} finally {
  await srv.close();
}
