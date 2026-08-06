import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertMapSize,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  GetHostedZoneCommand,
  ListHostedZonesByNameCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "../../aws/sim-aws.js";
import { assertIsSimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";
import {
  testAnswerer,
  testQuestion,
} from "../dns/answer/dns-answerer-test-query.js";
import { dnsRcodes } from "../dns/dns-rcode.js";
import {
  SimRoute53HostedZoneAlreadyExists,
  SimRoute53InvalidInput,
} from "../error/sim-route53.error.js";

// A real Hosted Zone ID, of the length AWS allocates, as a CDK app that looked
// its zone up would carry into its template.
const lookedUpHostedZoneId = "Z0123456789ABCDEFGHIJ";

describe("Registering a simulated Route53 Hosted Zone", () => {
  it("answers GetHostedZone under the registered ID", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is registered with a chosen ID.
    simRoute53.registerHostedZone({
      id: lookedUpHostedZoneId,
      name: "example.com",
      config: { Comment: "Looked-up zone", PrivateZone: false },
    });

    // Then the zone is read back under that ID.
    const hostedZoneOut = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({ Id: lookedUpHostedZoneId }),
    );

    assertObjectMatches(hostedZoneOut.HostedZone, {
      Id: lookedUpHostedZoneId,
      Name: "example.com.",
      Config: { Comment: "Looked-up zone", PrivateZone: false },
      ResourceRecordSetCount: 0,
    });

    // And it needs no background work to be synchronized, having been
    // described as already existing rather than created here.
    assertIsSimRoute53HostedZoneId(lookedUpHostedZoneId);
    const hostedZone = simRoute53.hostedZones.get(lookedUpHostedZoneId);
    assertNonNullable(hostedZone, "Registered Hosted Zone");
    assertIdentical(hostedZone.status, "INSYNC");
  });

  it("lists the registered Hosted Zone by name", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is registered.
    simRoute53.registerHostedZone({
      id: lookedUpHostedZoneId,
      name: "example.com",
    });

    // Then it is listed like any other Hosted Zone.
    const listOutput = await simRoute53.listHostedZonesByName(
      new ListHostedZonesByNameCommand({ DNSName: "example.com" }),
    );

    assertArrayLength(listOutput.HostedZones, 1);
    assertObjectMatches(listOutput.HostedZones[0], {
      Id: lookedUpHostedZoneId,
      Name: "example.com.",
    });
  });

  it("takes record-set changes and resolves them through simulated DNS", async () => {
    // Given a registered Hosted Zone.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    simRoute53.registerHostedZone({
      id: lookedUpHostedZoneId,
      name: "example.com",
    });

    // When a record is created in it.
    await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: lookedUpHostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.example.com",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "192.0.2.10" }],
              },
            },
          ],
        },
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then simulated DNS answers for the record, as it would for a zone the
    // simulation created.
    const answer = testAnswerer(simAws).answer(
      testQuestion("www.example.com", "A"),
    );

    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayLength(answer.answers, 1);
    assertArrayEquals([...answer.answers[0].rdata], [192, 0, 2, 10]);
  });

  it("accepts the /hostedzone/ form of the ID", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is registered by its prefixed ID, as a Route53
    // response carries it.
    simRoute53.registerHostedZone({
      id: `/hostedzone/${lookedUpHostedZoneId}`,
      name: "example.com",
    });

    // Then the bare ID is what the zone holds.
    const hostedZoneOut = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({ Id: lookedUpHostedZoneId }),
    );

    assertIdentical(hostedZoneOut.HostedZone?.Id, lookedUpHostedZoneId);
  });

  it("refuses an ID another registered Hosted Zone holds", () => {
    // Given a registered Hosted Zone.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    simRoute53.registerHostedZone({
      id: lookedUpHostedZoneId,
      name: "example.com",
    });

    // When the same ID is registered again.
    const error = assertThrowsError(() => {
      simRoute53.registerHostedZone({
        id: lookedUpHostedZoneId,
        name: "other.example.com",
      });
    });

    // Then the duplicate ID is refused.
    assertInstanceOf(error, SimRoute53HostedZoneAlreadyExists);
    assertStringIncludes(error.message, lookedUpHostedZoneId);
  });

  it("refuses an ID a created Hosted Zone already allocated", async () => {
    // Given a Hosted Zone created through the Route53 API.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    const hostedZoneCreation = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "created.example.com",
        CallerReference: "created-zone",
      }),
    );

    const createdHostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertNonNullable(createdHostedZoneId, "Created Hosted Zone ID");

    // When its allocated ID is registered.
    const error = assertThrowsError(() => {
      simRoute53.registerHostedZone({
        id: createdHostedZoneId,
        name: "registered.example.com",
      });
    });

    // Then the taken ID is refused.
    assertInstanceOf(error, SimRoute53HostedZoneAlreadyExists);
    assertStringIncludes(error.message, createdHostedZoneId);
  });

  it("refuses an ID that is not a Route53 Hosted Zone ID", () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a malformed ID is registered.
    const error = assertThrowsError(() => {
      simRoute53.registerHostedZone({
        id: "not-a-hosted-zone-id",
        name: "example.com",
      });
    });

    // Then the ID is refused before any zone exists to answer for it.
    assertInstanceOf(error, SimRoute53InvalidInput);
    assertStringIncludes(error.message, "not-a-hosted-zone-id");
    assertMapSize(simRoute53.hostedZones, 0);
  });

  it("still allocates its own ID for a Hosted Zone CreateHostedZone makes", async () => {
    // Given a registered Hosted Zone.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    simRoute53.registerHostedZone({
      id: lookedUpHostedZoneId,
      name: "example.com",
    });

    // When another Hosted Zone is created through the Route53 API.
    const hostedZoneCreation = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "created.example.com",
        CallerReference: "created-zone",
      }),
    );

    // Then its ID is allocated by the simulator, as real Route53 allocates it.
    const createdHostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertNonNullable(createdHostedZoneId, "Created Hosted Zone ID");
    assertStringStartsWith(createdHostedZoneId, "Z");
    assertFalse(
      createdHostedZoneId === lookedUpHostedZoneId,
      "Created Hosted Zone ID should not be the registered one",
    );
  });
});
