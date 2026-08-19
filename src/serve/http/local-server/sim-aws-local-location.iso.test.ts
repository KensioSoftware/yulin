import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import { assertIdentical, assertResponseStatus } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../service/aws/sim-aws.js";
import { SimAwsLocalLocation } from "./sim-aws-local-location.js";

const port = "51178";

/**
 * A hosted zone pointing `www.example.test` at a simulated CloudFront
 * distribution, which is the shape a served application's own domain has.
 */
async function makeDistributionRecord(simAws: SimAws): Promise<void> {
  const route53 = simAws.route53();
  const hostedZone = await route53.createHostedZone(
    new CreateHostedZoneCommand({
      Name: "example.test",
      CallerReference: "local-location-zone",
    }),
  );

  await route53.changeResourceRecordSets(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZone.HostedZone?.Id,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "www.example.test",
              Type: "CNAME",
              TTL: 60,
              ResourceRecords: [{ Value: "d111111abcdef8.cloudfront.net" }],
            },
          },
        ],
      },
    }),
  );

  await simAws.backgroundTasksComplete();
}

function redirectTo(location: string): Response {
  return new Response("Redirecting", {
    status: 303,
    headers: { location, "content-type": "text/plain" },
  });
}

describe("Localising a Location header on the way out of the local server", () => {
  it("localises a redirect to a hostname a record resolves", async () => {
    // Given a simulated environment serving www.example.test
    const simAws = new SimAws();
    await makeDistributionRecord(simAws);
    const localLocation = new SimAwsLocalLocation({
      simAws,
      port: () => port,
    });

    // When a redirect to that hostname is served
    const response = localLocation.localise(
      redirectTo("https://www.example.test/user/callback?code=abcd1234"),
    );

    // Then it names the address the local server answers on, and the rest of
    // the response is the one the service wrote
    assertIdentical(
      response.headers.get("location"),
      `http://www.example.test.sim-aws.localhost:${port}/user/callback?code=abcd1234`,
    );
    assertResponseStatus(response, 303);
    assertIdentical(response.headers.get("content-type"), "text/plain");
    assertIdentical(await response.text(), "Redirecting");
  });

  it("localises a redirect to an AWS service endpoint", () => {
    // Given a simulated environment with no records of its own
    const localLocation = new SimAwsLocalLocation({
      simAws: new SimAws(),
      port: () => port,
    });

    // When a redirect to a hostname the simulation serves as an AWS endpoint
    // is served
    const response = localLocation.localise(
      redirectTo("https://foo-site.s3-website.us-east-1.amazonaws.com/in.html"),
    );

    // Then the AWS domain is replaced by the local one, as a request for the
    // same endpoint has it replaced on the way in
    assertIdentical(
      response.headers.get("location"),
      `http://foo-site.s3-website.us-east-1.sim-aws.localhost:${port}/in.html`,
    );
  });

  it("leaves a redirect to a hostname the simulation does not serve", () => {
    // Given a simulated environment serving nothing under example.test
    const localLocation = new SimAwsLocalLocation({
      simAws: new SimAws(),
      port: () => port,
    });

    // When a redirect to a hostname outside the simulation is served
    const location = "https://auth.example.test/authorize?client_id=abcd1234";
    const response = localLocation.localise(redirectTo(location));

    // Then the client is sent where the service sent it
    assertIdentical(response.headers.get("location"), location);
  });

  it("leaves a relative redirect", () => {
    // Given a simulated environment served on localhost
    const localLocation = new SimAwsLocalLocation({
      simAws: new SimAws(),
      port: () => port,
    });

    // When a redirect within the same hostname is served
    const response = localLocation.localise(redirectTo("/user/sign-in"));

    // Then it is passed on, having named no hostname to localise
    assertIdentical(response.headers.get("location"), "/user/sign-in");
  });

  it("passes on a response carrying no Location header", async () => {
    // Given a simulated environment served on localhost
    const localLocation = new SimAwsLocalLocation({
      simAws: new SimAws(),
      port: () => port,
    });

    // When an ordinary page is served
    const response = localLocation.localise(
      new Response("<h1>Hello, world!</h1>", { status: 200 }),
    );

    // Then it is the response the service wrote
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>Hello, world!</h1>");
  });
});
