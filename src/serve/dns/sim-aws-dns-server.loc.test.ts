import dgram from "node:dgram";
import { Resolver } from "node:dns/promises";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  describeResponse,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAws } from "../../service/aws/sim-aws.js";
import {
  serveSimAws,
  type SimAwsLocalServer,
} from "../http/local-server/sim-aws-local-server.js";
import { SimAwsDnsServer } from "./sim-aws-dns-server.js";

describe("Simulated AWS DNS server", () => {
  const simAws = new SimAws();
  let server: SimAwsLocalServer;
  let resolver: Resolver;

  beforeAll(async () => {
    // A simulated S3 website, reachable at a hostname of its own.
    const simS3 = simAws.region("eu-west-2").s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "my-site" }));
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "my-site",
        WebsiteConfiguration: { IndexDocument: { Suffix: "index.html" } },
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "my-site",
        Key: "index.html",
        Body: "<h1>Hello from Yulin</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );

    // A Route53 name pointing at it, plus a name of a type it does not hold.
    const route53 = simAws.route53();
    const createOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.test",
        CallerReference: "dns-server-zone",
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
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "text.example.test",
                Type: "TXT",
                TTL: 300,
                ResourceRecords: [{ Value: "hello from yulin" }],
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    server = await serveSimAws({ simAws });

    resolver = new Resolver({ timeout: 1000, tries: 1 });
    resolver.setServers([`127.0.0.1:${server.dnsPort}`]);
  });

  afterAll(() => {
    server.close();
  });

  it("resolves a simulated Route53 name with a real DNS client", async () => {
    // Given a served simulated environment answering DNS on localhost.
    // When Node's resolver, which speaks real DNS over UDP, resolves the name.
    const addresses = await resolver.resolve4("www.example.test");

    // Then it follows the CNAME to the simulated S3 website and gets the address
    // the local HTTP server is listening on.
    assertArrayEquals(addresses, ["127.0.0.1"]);
  });

  it("serves over HTTP what DNS pointed at, for the same name", async () => {
    // Given the address DNS just answered with.
    const addresses = await resolver.resolve4("www.example.test");
    assertIdentical(addresses[0], "127.0.0.1");

    // When the same name is requested over HTTP on the local server.
    // The `.sim-aws.localhost` suffix and the port are still needed, because
    // nothing has pointed this machine's resolver at the simulator; the DNS
    // answer says which address serves the name, not how to reach it by name.
    const response = await fetch(
      `http://www.example.test.sim-aws.localhost:${server.port}/`,
    );

    // Then the simulated S3 website answers, so the DNS answer and the HTTP
    // response describe the same thing.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertStringIncludes(await response.text(), "Hello from Yulin");
  });

  it("resolves a TXT record through the same server", async () => {
    // Given a TXT record in the zone.
    // When it is resolved.
    const values = await resolver.resolveTxt("text.example.test");

    // Then the stored value comes back through a real client.
    assertArrayEquals(values.flat(), ["hello from yulin"]);
  });

  it("reports a name the zone does not hold as not found", async () => {
    // Given a name in a served zone that holds no record.
    // When it is resolved.
    const error = await assertThrowsErrorAsync(async () =>
      resolver.resolve4("missing.example.test"),
    );

    // Then the client sees a name error rather than a timeout.
    assertInstanceOf(error, Error);
    assertIdentical((error as NodeJS.ErrnoException).code, "ENOTFOUND");
  });

  it("answers DNS on the same port number the HTTP server took", () => {
    // Given a served environment with both protocols up.
    // When the two ports are compared.
    // Then they are the same number, UDP and TCP having separate namespaces.
    assertIdentical(server.dnsPort, server.port);
  });

  it("throws when the port is read before the server is listening", () => {
    // Given a DNS server that has not been started.
    const dnsServer = new SimAwsDnsServer({ simAws });

    // When its port is read.
    const error = assertThrowsError(() => dnsServer.port);

    // Then it says so rather than reporting a meaningless port.
    assertStringIncludes(error.message, "not yet listening");
  });

  it("ignores being closed before it was ever started", () => {
    // Given a DNS server that has not been started.
    const dnsServer = new SimAwsDnsServer({ simAws });

    // When it is closed anyway, as a test teardown might.
    dnsServer.close();

    // Then nothing is thrown, so teardown does not have to track whether the
    // server got as far as listening.
    assertIdentical(true, true);
  });

  it("falls back to another port when the preferred one is taken on UDP", async () => {
    // Given an unrelated process already holding a UDP port.
    const occupier = dgram.createSocket("udp4");
    await new Promise<void>((resolve) => {
      occupier.bind(0, "127.0.0.1", resolve);
    });
    const occupiedPort = occupier.address().port;

    // When a DNS server is asked to bind that same port.
    const dnsServer = await new SimAwsDnsServer({ simAws }).listen(
      occupiedPort,
    );

    try {
      // Then it serves on a different port rather than failing to serve at all.
      assertIdentical(dnsServer.port === String(occupiedPort), false);

      const fallbackResolver = new Resolver({ timeout: 1000, tries: 1 });
      fallbackResolver.setServers([`127.0.0.1:${dnsServer.port}`]);
      assertArrayEquals(await fallbackResolver.resolve4("www.example.test"), [
        "127.0.0.1",
      ]);
    } finally {
      dnsServer.close();
      occupier.close();
    }
  });
});
