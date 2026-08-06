import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import {
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  serveSimAws,
  type SimAwsLocalServer,
} from "../../../serve/http/local-server/sim-aws-local-server.js";

describe("Simulated Route53 hosted zone summary over localhost", () => {
  const simAws = new SimAws();
  let server: SimAwsLocalServer;

  beforeAll(async () => {
    const route53 = simAws.route53();

    const hostedZoneCreation = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "served.test",
        CallerReference: "served-summary-zone",
      }),
    );

    await route53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: hostedZoneCreation.HostedZone?.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.served.test",
                Type: "CNAME",
                TTL: 300,
                ResourceRecords: [{ Value: "my-site.s3-website.eu-west-2" }],
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    server = await serveSimAws({ simAws });
  });

  afterAll(async () => {
    await server.close();
  });

  it("serves the hosted zone summary in a browser-viewable page", async () => {
    // Given a served simulated AWS environment holding one Hosted Zone.
    // When the summary host is requested over real localhost HTTP.
    const response = await fetch(
      `http://dns.sim-aws.localhost:${server.port}/`,
    );

    // Then the zone and its record are rendered as HTML.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertStringIncludes(
      response.headers.get("content-type") ?? "",
      "text/html",
    );

    const body = await response.text();
    assertStringIncludes(body, "served.test.");
    assertStringIncludes(body, "www.served.test.");
    assertStringIncludes(body, "my-site.s3-website.eu-west-2");
  });
});
