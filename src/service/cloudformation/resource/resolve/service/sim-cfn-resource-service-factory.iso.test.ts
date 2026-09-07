import { assertInstanceOf, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { SimCfnResource } from "../../sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { SimS3CloudFormationResourceFactory } from "../../../../s3/cfn/sim-cfn-s3-resource-factory.js";
import { simCfnResourceServiceFactory } from "./sim-cfn-resource-service-factory.js";

describe("the service factory owning a CloudFormation Resource", () => {
  const resource = (template: SimCfnTemplateValueRecord): SimCfnResource =>
    new SimCfnResource({ logicalId: "Thing", template });

  it("finds the factory for a Resource type a service simulates", () => {
    // Given a Resource of a simulated type.
    const simAws = new SimAws();

    // When its owning service is looked up.
    const service = simCfnResourceServiceFactory(
      simAws,
      resource({ Type: "AWS::S3::Bucket" }),
    );

    // Then S3 owns it, under the type name S3 knows it by.
    assertInstanceOf(service?.factory, SimS3CloudFormationResourceFactory);
  });

  it("finds nothing for a Resource type no service simulates", () => {
    // Given a Resource of a type outside the simulation.
    const simAws = new SimAws();

    // When its owning service is looked up.
    const service = simCfnResourceServiceFactory(
      simAws,
      resource({ Type: "AWS::EC2::Instance" }),
    );

    // Then nothing owns it, which is what makes an update leave it alone.
    assertUndefined(service);
  });

  it("finds nothing for a Resource with no Type at all", () => {
    // Given a Resource entry the template gave no Type.
    const simAws = new SimAws();

    // When its owning service is looked up.
    const service = simCfnResourceServiceFactory(
      simAws,
      resource({ Properties: { BucketName: "nameless" } }),
    );

    // Then nothing owns it.
    assertUndefined(service);
  });
});
