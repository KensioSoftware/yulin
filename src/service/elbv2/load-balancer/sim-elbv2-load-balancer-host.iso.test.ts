import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../util/type-guard/defined.js";
import { readSimElbV2LoadBalancerHost } from "./sim-elbv2-load-balancer-host.js";

describe("Reading a sim ELBv2 load balancer host name", () => {
  it("reads the load balancer host name real ELB issues", () => {
    // Given the DNS name of an internet-facing load balancer

    // When it is read as a host name
    const host = readSimElbV2LoadBalancerHost(
      "shop-alb-0000000001.eu-west-1.elb.amazonaws.com",
    );

    // Then it names a load balancer in the Region the name carries
    assertDefined(host, "A load balancer DNS name was not recognised");
    assertIdentical(
      host.dnsName,
      "shop-alb-0000000001.eu-west-1.elb.amazonaws.com",
    );
    assertIdentical(host.regionName, "eu-west-1");
  });

  it("reads an internal load balancer host name", () => {
    // Given the DNS name of an internal load balancer, which carries the
    // prefix real ELB reserves for one

    // When it is read as a host name
    const host = readSimElbV2LoadBalancerHost(
      "internal-shop-alb-0000000002.us-east-1.elb.amazonaws.com",
    );

    // Then it names a load balancer as an internet-facing one does
    assertDefined(
      host,
      "An internal load balancer DNS name was not recognised",
    );
    assertIdentical(host.regionName, "us-east-1");
  });

  it("reads a host name in the case host names are compared in", () => {
    // Given the same name written in upper case, as a DNS client may send it

    // When it is read as a host name
    const host = readSimElbV2LoadBalancerHost(
      "SHOP-ALB-0000000001.EU-WEST-1.ELB.AMAZONAWS.COM",
    );

    // Then it names the same load balancer, since host names are not case
    // sensitive
    assertDefined(host, "An upper case load balancer DNS name was not read");
    assertIdentical(
      host.dnsName,
      "shop-alb-0000000001.eu-west-1.elb.amazonaws.com",
    );
  });

  it("reads nothing from a host name of another shape", () => {
    // Given host names that are not the one ELB issues: another domain, the
    // ELB domain with no Region label, one with a label too many, and one with
    // no load balancer label at all
    const others = [
      "shop-alb-0000000001.eu-west-1.elb.example.com",
      "shop-alb-0000000001.elb.amazonaws.com",
      "shop.alb-0000000001.eu-west-1.elb.amazonaws.com",
      "eu-west-1.elb.amazonaws.com",
      "d111111abcdef8.cloudfront.net",
    ];

    // When each is read as a load balancer host name
    // Then none of them names one
    for (const other of others) {
      assertUndefined(
        readSimElbV2LoadBalancerHost(other),
        `${other} was read as a load balancer host name`,
      );
    }
  });
});
