import { assertObjectMatches, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * The Yulin-local suffix is optional on a hostname arriving over HTTP, because
 * the simulated DNS server answers for logical zone names. A resolver pointed at
 * the simulator therefore sends a client here under the hostname the application
 * really uses, with no suffix on it.
 */
describe("SimRoute53 hostname resolution without the local suffix", () => {
  it("resolves a CNAME under the logical hostname", async () => {
    // Given a hosted zone with a CNAME pointing at a simulated S3 website.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();
    const hostedZoneCreation = await simRoute53.createHostedZone({
      input: { Name: "example.test", CallerReference: "example-test" },
    });
    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneCreation.HostedZone?.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.example.test",
                Type: "CNAME",
                ResourceRecords: [
                  { Value: "site-bucket.s3-website.eu-west-1" },
                ],
              },
            },
          ],
        },
      },
    });
    await simAws.backgroundTasksComplete();

    // When the hostname is resolved without the local suffix.
    const target = simRoute53.resolveHttpHost("www.example.test");

    // Then it reaches the same S3 website the suffixed hostname reaches.
    assertObjectMatches(target, {
      service: "s3",
      resourceName: "site-bucket",
      regionName: "eu-west-1",
    });
  });

  it("resolves a zone apex under the logical hostname", async () => {
    // Given a hosted zone with an apex A alias pointing at a CloudFront hostname.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();
    const hostedZoneCreation = await simRoute53.createHostedZone({
      input: { Name: "apex.test", CallerReference: "apex-test" },
    });
    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneCreation.HostedZone?.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "apex.test",
                Type: "A",
                AliasTarget: {
                  DNSName: "EDFDVBD6EXAMPLE.cloudfront.net",
                  HostedZoneId: "Z2FDTNDATAQYW2",
                  EvaluateTargetHealth: false,
                },
              },
            },
          ],
        },
      },
    });
    await simAws.backgroundTasksComplete();

    // When the apex is resolved as a browser would present it in a Host header.
    const target = simRoute53.resolveHttpHost("apex.test");

    // Then it routes to the CloudFront Distribution, so an exact apex Host can
    // reach a Distribution for the first time.
    assertObjectMatches(target, {
      service: "cloudFront",
      resourceName: "edfdvbd6example",
    });
  });

  it("resolves a built-in service hostname without the local suffix", () => {
    // Given simulated AWS.
    const simAws = new SimAws();

    // When a simulated S3 website hostname is resolved with no suffix on it.
    const target = simAws
      .route53()
      .resolveHttpHost("site-bucket.s3-website.eu-west-1");

    // Then the service target is recognised by its shape, as it is with the
    // suffix, because the suffix never carried any of that meaning.
    assertObjectMatches(target, {
      service: "s3",
      resourceName: "site-bucket",
      regionName: "eu-west-1",
    });
  });

  it("returns undefined for a hostname held by no hosted zone", () => {
    // Given simulated AWS holding no hosted zones.
    const simAws = new SimAws();

    // When a hostname nothing answers for is resolved.
    const target = simAws.route53().resolveHttpHost("nothing.example.test");

    // Then no target is resolved, so the request is still refused rather than
    // dropping through to some default service.
    assertUndefined(target);
  });

  it("returns undefined for a hostname containing an empty label", () => {
    // Given simulated AWS.
    const simAws = new SimAws();

    // When a malformed hostname is resolved.
    const target = simAws.route53().resolveHttpHost("www..example.test");

    // Then no target is resolved, rather than the empty label being normalised
    // away into a hostname that does resolve.
    assertUndefined(target);
  });
});
