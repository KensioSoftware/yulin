import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCloudFormationResourceCreateContext } from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimRoute53HostedZone } from "../hosted-zone/sim-route53-hosted-zone.js";
import { SimRoute53CloudFormationResourceFactory } from "./sim-cfn-route53-resource-factory.js";

describe("SimRoute53CloudFormationResourceFactory", () => {
  it("creates a Route53 Hosted Zone", async () => {
    const simAws = new SimAws();
    const route53 = simAws.route53();
    const resource = new SimCfnResource({
      logicalId: "ExampleHostedZone",
      template: {
        Type: "AWS::Route53::HostedZone",
        Properties: {
          Name: "example.test",
          HostedZoneConfig: {
            Comment: "Example hosted zone",
          },
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimRoute53CloudFormationResourceFactory({ route53 });

    const hostedZone = await factory.create("HostedZone", resource, context);

    assertInstanceOf(hostedZone, SimRoute53HostedZone);
    assertIdentical(hostedZone.name, "example.test.");
    assertIdentical(hostedZone.callerReference, "ExampleHostedZone");
    assertIdentical(hostedZone.config?.Comment, "Example hosted zone");
    assertIdentical(route53.hostedZones.get(hostedZone.id), hostedZone);
  });

  it("creates a Route53 Hosted Zone from resolved properties", async () => {
    const simAws = new SimAws();
    const route53 = simAws.route53();
    const resource = new SimCfnResource({
      logicalId: "ResolvedHostedZone",
      template: {
        Type: "AWS::Route53::HostedZone",
        Properties: {
          Name: "unresolved.example.test",
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
      resolvedProperties: {
        Name: "resolved.example.test",
      },
    };
    const factory = new SimRoute53CloudFormationResourceFactory({ route53 });

    const hostedZone = await factory.create("HostedZone", resource, context);

    assertInstanceOf(hostedZone, SimRoute53HostedZone);
    assertIdentical(hostedZone.name, "resolved.example.test.");
  });

  it("rejects unsupported Route53 resource types", async () => {
    const simAws = new SimAws();
    const route53 = simAws.route53();
    const resource = new SimCfnResource({
      logicalId: "UnsupportedRoute53Resource",
      template: {
        Type: "AWS::Route53::UnsupportedResource",
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimRoute53CloudFormationResourceFactory({ route53 });

    const error = await assertThrowsErrorAsync(async () =>
      factory.create("UnsupportedResource", resource, context),
    );

    assertIdentical(
      error.message,
      "Unsupported sim Route53 CloudFormation Resource UnsupportedResource",
    );
  });

  it("rejects a Hosted Zone without a string Name", async () => {
    const simAws = new SimAws();
    const route53 = simAws.route53();
    const resource = new SimCfnResource({
      logicalId: "InvalidHostedZone",
      template: {
        Type: "AWS::Route53::HostedZone",
        Properties: {},
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimRoute53CloudFormationResourceFactory({ route53 });

    const error = await assertThrowsErrorAsync(async () =>
      factory.create("HostedZone", resource, context),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::Route53::HostedZone InvalidHostedZone: Name must be a string",
    );
  });
});
