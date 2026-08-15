import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import { SimCfnCfOriginAccessControlConfig } from "./sim-cfn-cf-oac-config.js";

describe("SimCfnCfOriginAccessControlConfig", () => {
  const resource = new SimCfnResource({ logicalId: "SiteOac" });

  function originAccessControlFrom(
    config: SimCfnTemplateValueRecord,
  ): SimCloudFrontOriginAccessControl {
    return new SimCfnCfOriginAccessControlConfig({
      resource,
      properties: {
        OriginAccessControlConfig: {
          Name: "site-oac",
          OriginAccessControlOriginType: "s3",
          SigningBehavior: "always",
          SigningProtocol: "sigv4",
          ...config,
        },
      },
    }).build();
  }

  function refusalFrom(config: SimCfnTemplateValueRecord): string {
    return assertThrowsError(() => originAccessControlFrom(config)).message;
  }

  it("reads the config CDK synthesizes for an S3 origin", () => {
    // Given the config CDK emits for S3BucketOrigin.withOriginAccessControl.
    const originAccessControl = originAccessControlFrom({});

    // Then the name and signing behaviour are read, and the supported origin
    // type and protocol are what the origin access control reports.
    assertIdentical(originAccessControl.name, "site-oac");
    assertIdentical(originAccessControl.signingBehavior, "always");
    assertIdentical(originAccessControl.originType, "s3");
    assertIdentical(originAccessControl.signingProtocol, "sigv4");
    assertUndefined(originAccessControl.description);
  });

  it("reads a description", () => {
    // Given a config carrying the optional description.
    const originAccessControl = originAccessControlFrom({
      Description: "Signs reads of the site bucket",
    });

    assertIdentical(
      originAccessControl.description,
      "Signs reads of the site bucket",
    );
  });

  it("reads each signing behaviour CloudFront offers", () => {
    // Given each of the three signing behaviours.
    for (const signingBehavior of ["always", "never", "no-override"] as const) {
      const originAccessControl = originAccessControlFrom({
        SigningBehavior: signingBehavior,
      });

      // Then each is stored as written rather than refused.
      assertIdentical(originAccessControl.signingBehavior, signingBehavior);
    }
  });

  it("reads the config CDK synthesizes for a Function URL origin", () => {
    // Given the config CDK emits for
    // FunctionUrlOrigin.withOriginAccessControl.
    const originAccessControl = originAccessControlFrom({
      OriginAccessControlOriginType: "lambda",
    });

    // Then it signs for a Lambda Function URL rather than for a Bucket.
    assertIdentical(originAccessControl.originType, "lambda");
    assertIdentical(originAccessControl.signingBehavior, "always");
  });

  it("refuses an origin type it does not sign for", () => {
    // Given a config for a MediaStore Origin, which CloudFront signs for and
    // this simulation does not.
    const message = refusalFrom({
      OriginAccessControlOriginType: "mediastore",
    });

    // Then it is refused by name, rather than stored and treated as an S3
    // origin access control.
    assertStringIncludes(
      message,
      "Invalid AWS::CloudFront::OriginAccessControl SiteOac",
    );
    assertStringIncludes(message, "OriginAccessControlOriginType mediastore");
    assertStringIncludes(message, "s3, lambda");
  });

  it("refuses a missing origin type", () => {
    // Given a config with no origin type, which the CloudFormation schema
    // requires.
    const error = assertThrowsError(() =>
      new SimCfnCfOriginAccessControlConfig({
        resource,
        properties: {
          OriginAccessControlConfig: {
            Name: "site-oac",
            SigningBehavior: "always",
            SigningProtocol: "sigv4",
          },
        },
      }).build(),
    );

    assertStringIncludes(
      error.message,
      "OriginAccessControlOriginType undefined",
    );
  });

  it("refuses a signing protocol it cannot sign with", () => {
    // Given a config naming a protocol other than SigV4.
    const message = refusalFrom({ SigningProtocol: "sigv2" });

    assertStringIncludes(message, "SigningProtocol sigv2");
  });

  it("refuses a signing behaviour that is not one of CloudFront's", () => {
    // Given a config naming a signing behaviour CloudFront has no such value
    // for.
    const message = refusalFrom({ SigningBehavior: "sometimes" });

    assertStringIncludes(message, "SigningBehavior sometimes");
    assertStringIncludes(message, "always, never, no-override");
  });

  it("refuses a name that is not a string", () => {
    // Given a config whose Name did not resolve to a string.
    const message = refusalFrom({ Name: 42 });

    assertStringIncludes(message, "Name must be a string");
  });

  it("refuses a missing name", () => {
    // Given a config with no Name, which the CloudFormation schema requires.
    const error = assertThrowsError(() =>
      new SimCfnCfOriginAccessControlConfig({
        resource,
        properties: {
          OriginAccessControlConfig: {
            OriginAccessControlOriginType: "s3",
            SigningBehavior: "always",
            SigningProtocol: "sigv4",
          },
        },
      }).build(),
    );

    assertStringIncludes(error.message, "Name must be a string");
  });

  it("refuses a description that is not a string", () => {
    // Given a config whose Description did not resolve to a string.
    const message = refusalFrom({ Description: 42 });

    assertStringIncludes(message, "Description must be a string");
  });

  it("refuses a config that is not an object", () => {
    // Given a Resource with no OriginAccessControlConfig at all.
    const error = assertThrowsError(() =>
      new SimCfnCfOriginAccessControlConfig({
        resource,
        properties: {},
      }).build(),
    );

    assertStringIncludes(
      error.message,
      "OriginAccessControlConfig must be an object",
    );
  });
});
