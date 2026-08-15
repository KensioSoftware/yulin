import { CreateListenerCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimElbV2CertificateNotFoundException,
  SimElbV2InvalidConfigurationRequestException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import { SimElbV2 } from "../../sim-elbv2.js";
import {
  createFixtureCertificate,
  createFixtureLambdaTargetGroup,
  createFixtureLoadBalancer,
} from "../../sim-elbv2.fixture.js";
import type { SimCreateListenerCommandOutput } from "./listener.command.js";

/**
 * A certificate ARN of the shape ACM issues, naming a certificate no simulated
 * ACM holds.
 */
const missingCertificateArn =
  "arn:aws:acm:us-east-1:888888888888:certificate/00000009";

/**
 * Create an HTTPS listener with the certificates a test names.
 */
async function createHttpsListener(
  simAws: SimAws,
  certificateArns: readonly (string | undefined)[],
  name = "shop-alb",
): Promise<SimCreateListenerCommandOutput> {
  const elbV2 = simAws.elbV2();
  const loadBalancerArn = await createFixtureLoadBalancer(elbV2, name);
  const targetGroupArn = await createFixtureLambdaTargetGroup(
    elbV2,
    `${name}-tg`,
  );

  return await elbV2.createListener(
    new CreateListenerCommand({
      LoadBalancerArn: loadBalancerArn,
      Protocol: "HTTPS",
      Port: 443,
      Certificates: certificateArns.map((arn) => ({ CertificateArn: arn })),
      DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
    }),
  );
}

describe("An HTTPS listener's certificate", () => {
  it("takes an issued certificate from simulated ACM", async () => {
    // Given an issued certificate.
    const simAws = new SimAws();
    const certificateArn = await createFixtureCertificate(simAws);

    // When an HTTPS listener names it.
    const output = await createHttpsListener(simAws, [certificateArn]);

    // Then the listener holds it as its default certificate.
    assertArrayLength(output.Listeners, 1);
    assertArrayLength(output.Listeners[0].Certificates, 1);
    assertIdentical(
      output.Listeners[0].Certificates[0].CertificateArn,
      certificateArn,
    );
    assertTrue(output.Listeners[0].Certificates[0].IsDefault);
  });

  it("refuses a certificate simulated ACM does not hold, naming it", async () => {
    // Given simulated ACM holding no such certificate.
    const simAws = new SimAws();

    // When an HTTPS listener names one anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await createHttpsListener(simAws, [missingCertificateArn]);
    });

    assertInstanceOf(error, SimElbV2CertificateNotFoundException);

    // Then it is refused with the ARN a reader has to go and fix.
    assertStringIncludes(error.message, missingCertificateArn);
    assertStringIncludes(error.message, "not found in simulated ACM");
  });

  it("refuses a certificate that is pending validation rather than issued", async () => {
    // Given a certificate waiting on a DNS validation record nothing wrote.
    const simAws = new SimAws();
    const acm = simAws.acm().requireDnsValidation();
    const requested = await acm.requestCertificate({
      input: { DomainName: "shop.example.com" },
    });

    await simAws.backgroundTasksComplete();

    // When an HTTPS listener names it.
    const error = await assertThrowsErrorAsync(async () => {
      await createHttpsListener(simAws, [requested.CertificateArn]);
    });

    assertInstanceOf(error, SimElbV2InvalidConfigurationRequestException);

    // Then it is refused, since a listener presenting it could serve nothing.
    assertStringIncludes(error.message, "PENDING_VALIDATION");
    assertStringIncludes(error.message, "not ISSUED");
  });

  it("refuses a certificate from another Region", async () => {
    // Given an issued certificate in a Region the load balancer is not in.
    const simAws = new SimAws();
    const certificateArn = await createFixtureCertificate(
      simAws,
      simAws.region("eu-west-2").acm(),
    );

    // When an HTTPS listener in the default Region names it.
    const error = await assertThrowsErrorAsync(async () => {
      await createHttpsListener(simAws, [certificateArn]);
    });

    assertInstanceOf(error, SimElbV2InvalidConfigurationRequestException);

    // Then it is refused, as real ELB refuses a certificate from elsewhere.
    assertStringIncludes(error.message, "eu-west-2");
    assertStringIncludes(error.message, "own Account and Region");
  });

  it("refuses a listener naming more than one certificate", async () => {
    // Given two issued certificates.
    const simAws = new SimAws();
    const shop = await createFixtureCertificate(simAws);
    const admin = await createFixtureCertificate(
      simAws,
      simAws.acm(),
      "admin.example.com",
    );

    // When one listener names both as its default.
    const error = await assertThrowsErrorAsync(async () => {
      await createHttpsListener(simAws, [shop, admin]);
    });

    assertInstanceOf(error, SimElbV2InvalidConfigurationRequestException);

    // Then it is refused, with the operation the rest of them go on with.
    assertStringIncludes(error.message, "one default certificate");
    assertStringIncludes(error.message, "AddListenerCertificates");
  });

  it("refuses a certificate carrying no ARN, or something that is not one", async () => {
    // Given simulated ELBv2.
    const simAws = new SimAws();

    // When a listener names a certificate with nothing in it, and one naming
    // something that is not an ARN at all.
    const empty = await assertThrowsErrorAsync(async () => {
      await createHttpsListener(simAws, [undefined]);
    });

    assertInstanceOf(empty, SimElbV2ValidationError);

    const notAnArn = await assertThrowsErrorAsync(async () => {
      await createHttpsListener(simAws, ["shop.example.com"], "other-alb");
    });

    assertInstanceOf(notAnArn, SimElbV2ValidationError);

    // Then each is refused.
    assertStringIncludes(empty.message, "requires a CertificateArn");
    assertStringIncludes(notAnArn.message, "not an ACM certificate ARN");
  });

  it("checks nothing where there is no simulated ACM to check against", async () => {
    // Given a standalone simulated ELBv2, which has no ACM beside it.
    const elbV2 = new SimElbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);

    // When an HTTPS listener names a certificate nothing issued.
    const output = await elbV2.createListener({
      input: {
        LoadBalancerArn: loadBalancerArn,
        Protocol: "HTTPS",
        Port: 443,
        Certificates: [{ CertificateArn: missingCertificateArn }],
        DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      },
    });

    // Then it is held as given, since refusing it would be refusing a
    // certificate this simulation has no way of knowing anything about.
    assertArrayLength(output.Listeners, 1);
    assertArrayLength(output.Listeners[0].Certificates, 1);
    assertIdentical(
      output.Listeners[0].Certificates[0].CertificateArn,
      missingCertificateArn,
    );
  });
});
