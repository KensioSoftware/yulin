/**
 * Deploying a CDK template with Route53 resources into simulated AWS.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const stack = await simAws
    .cloudFormation()
    .deployTemplateFile(
      path.join(process.cwd(), "cdk.out", "TestStack.template.json"),
    );

  await stack.waitForDeployComplete();
  await simAws.backgroundTasksComplete();

  const response = await fetch(
    `http://www.example.test.sim-aws.localhost:${srv.port}/`,
  );

  console.log(response.status);
  console.log(await response.text());
} finally {
  srv.close();
}
