import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertStringNotIncludes,
  assertTrue,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { compareOrdinal } from "../command/list-resource-record-sets/list-record-sets-order.js";

const summaryUrl = "http://dns.sim-aws.localhost/";

describe("Simulated Route53 hosted zone summary", () => {
  it("reports that no hosted zones exist yet", async () => {
    // Given a simulated AWS environment with no Route53 Hosted Zones.
    const simAws = new SimAws();
    const simAwsHttp = new SimAwsHttp({ simAws });

    // When the Route53 summary host is requested.
    const response = await simAwsHttp.fetch(summaryUrl);

    // Then the page says so rather than rendering an empty table.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertStringIncludes(
      await response.text(),
      "No simulated Route53 hosted zones exist yet.",
    );
  });

  it("renders hosted zones and their records", async () => {
    // Given a Hosted Zone holding a CNAME record.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    const createOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.test",
        CallerReference: "summary-zone",
      }),
    );

    await route53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: createOutput.HostedZone?.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.example.test",
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

    // When the Route53 summary host is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(summaryUrl);

    // Then the zone, its status and its record are all shown.
    assertResponseStatus(response, 200, await describeResponse(response));
    const body = await response.text();
    assertStringIncludes(body, "example.test.");
    assertStringIncludes(body, "INSYNC");
    assertStringIncludes(body, "1 record(s)");
    assertStringIncludes(body, "www.example.test.");
    assertStringIncludes(body, "CNAME");
    assertStringIncludes(body, "300");
    assertStringIncludes(body, "my-site.s3-website.eu-west-2");
  });

  it("shows an alias record without a TTL and marked as an alias", async () => {
    // Given a Hosted Zone holding an alias record.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    const createOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "alias.test",
        CallerReference: "summary-alias-zone",
      }),
    );

    await route53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: createOutput.HostedZone?.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "cdn.alias.test",
                Type: "A",
                AliasTarget: {
                  HostedZoneId: "Z2FDTNDATAQYW2",
                  DNSName: "d111111abcdef8.cloudfront.net",
                  EvaluateTargetHealth: false,
                },
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the Route53 summary host is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(summaryUrl);

    // Then the alias target is shown with an em dash in place of a TTL.
    const body = await response.text();
    assertStringIncludes(body, "d111111abcdef8.cloudfront.net (alias)");
    assertStringIncludes(body, "<td>—</td>");
  });

  it("reports a hosted zone that holds no records", async () => {
    // Given a Hosted Zone with no records.
    const simAws = new SimAws();

    await simAws.route53().createHostedZone(
      new CreateHostedZoneCommand({
        Name: "bare.test",
        CallerReference: "summary-bare-zone",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the Route53 summary host is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(summaryUrl);

    // Then the zone appears with an explanation rather than an empty table.
    const body = await response.text();
    assertStringIncludes(body, "bare.test.");
    assertStringIncludes(body, "No records in this hosted zone.");
  });

  it("escapes hosted zone and record text", async () => {
    // Given a record whose value contains HTML.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    const createOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "escaping.test",
        CallerReference: "summary-escaping-zone",
      }),
    );

    await route53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: createOutput.HostedZone?.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "escaping.test",
                Type: "TXT",
                TTL: 60,
                ResourceRecords: [{ Value: "<script>alert('x')</script>" }],
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the Route53 summary host is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(summaryUrl);

    // Then the value is escaped rather than rendered as markup.
    const body = await response.text();
    assertStringNotIncludes(body, "<script>");
    assertStringIncludes(body, "&lt;script&gt;");
    assertStringIncludes(body, "&#39;x&#39;");
  });

  it("lists hosted zones from every simulated Account", async () => {
    // Given Hosted Zones created in two different simulated Accounts.
    const simAws = new SimAws();

    await simAws
      .account("111111111111")
      .route53()
      .createHostedZone(
        new CreateHostedZoneCommand({
          Name: "first-account.test",
          CallerReference: "first-account-zone",
        }),
      );

    await simAws
      .account("222222222222")
      .route53()
      .createHostedZone(
        new CreateHostedZoneCommand({
          Name: "second-account.test",
          CallerReference: "second-account-zone",
        }),
      );
    await simAws.backgroundTasksComplete();

    // When the Route53 summary host is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(summaryUrl);

    // Then both zones appear, because DNS resolution is environment-wide.
    const body = await response.text();
    assertStringIncludes(body, "first-account.test.");
    assertStringIncludes(body, "second-account.test.");
  });

  it("lists duplicate-named hosted zones in a stable order", async () => {
    // Given two Hosted Zones sharing a DNS name, which Route53 permits when
    // their caller references differ.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    const firstOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "duplicate.test",
        CallerReference: "first-duplicate-zone",
      }),
    );
    const secondOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "duplicate.test",
        CallerReference: "second-duplicate-zone",
      }),
    );
    await simAws.backgroundTasksComplete();

    const firstId = firstOutput.HostedZone?.Id ?? "";
    const secondId = secondOutput.HostedZone?.Id ?? "";

    // When the Route53 summary host is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(summaryUrl);

    // Then both zones are shown, ordered by ID because their names are equal.
    const body = await response.text();
    const [earlierId, laterId] = [firstId, secondId].toSorted(compareOrdinal);
    assertNonNullable(earlierId, "earlier hosted zone ID");
    assertNonNullable(laterId, "later hosted zone ID");
    assertTrue(body.indexOf(earlierId) < body.indexOf(laterId));
  });

  it("responds HTTP 404 for any other path on the summary host", async () => {
    // Given a simulated AWS environment served over HTTP.
    const simAwsHttp = new SimAwsHttp();

    // When a path other than the root is requested on the summary host.
    const response = await simAwsHttp.fetch(
      "http://dns.sim-aws.localhost/records.json",
    );

    // Then Route53 reports that nothing is served there.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertStringIncludes(
      await response.text(),
      "No simulated Route53 resource at /records.json",
    );
  });
});
