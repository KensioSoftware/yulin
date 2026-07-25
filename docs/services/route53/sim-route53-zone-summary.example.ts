/**
 * Inspecting simulated Route53 hosted zones in a browser.
 */

import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

await simAws.route53().createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "browsable-zone",
  }),
);

await simAws.backgroundTasksComplete();

const srv = await serveSimAws({ simAws });

// Open this in a browser to see every hosted zone and record.
console.log(`http://dns.sim-aws.localhost:${srv.port}/`);
