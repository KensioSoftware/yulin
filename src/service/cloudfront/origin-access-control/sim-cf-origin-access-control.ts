import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";

export type SimCloudFrontOriginAccessControlId = Brand<
  string,
  "SimCloudFrontOriginAccessControlId"
>;

/**
 * When CloudFront signs the request it sends to the Origin.
 *
 * `always` signs every request. `never` signs none, which turns the origin
 * access control off without removing it. `no-override` signs a request the
 * viewer did not already sign, and passes a signed one through.
 */
export type SimCloudFrontOriginAccessControlSigningBehavior =
  | "always"
  | "never"
  | "no-override";

interface SimCloudFrontOriginAccessControlProperties {
  readonly id?: SimCloudFrontOriginAccessControlId;
  readonly name: string;
  readonly description?: string;
  readonly signingBehavior: SimCloudFrontOriginAccessControlSigningBehavior;
}

/**
 * Simulated CloudFront origin access control.
 *
 * An origin access control is attached to an Origin, and it is how a
 * Distribution authenticates to a private S3 Bucket: CloudFront signs the
 * Origin request with SigV4 as the CloudFront service principal, and the Bucket
 * policy grants that principal on the Distribution's ARN.
 *
 * Only an `s3` origin type signed with `sigv4` is modelled, so those are fixed
 * here rather than stored. Anything else is refused where the origin access
 * control is read, rather than kept and treated as though it behaved like the
 * supported values.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
 */
export class SimCloudFrontOriginAccessControl {
  public readonly id: SimCloudFrontOriginAccessControlId;
  public readonly name: string;
  public readonly description: string | undefined;
  public readonly signingBehavior: SimCloudFrontOriginAccessControlSigningBehavior;

  /**
   * The kind of Origin this origin access control signs for.
   */
  public readonly originType = "s3";

  /**
   * The protocol CloudFront signs the Origin request with.
   */
  public readonly signingProtocol = "sigv4";

  constructor(properties: SimCloudFrontOriginAccessControlProperties) {
    this.id = properties.id ?? makeOriginAccessControlId();
    this.name = properties.name;
    this.description = properties.description;
    this.signingBehavior = properties.signingBehavior;
  }

  /**
   * Whether this origin access control signs the request for an Origin read.
   *
   * `no-override` signs a request the viewer did not sign, and nothing here
   * sends a pre-signed viewer request to an Origin, so it signs too.
   */
  get signs(): boolean {
    return this.signingBehavior !== "never";
  }
}

export type SimCloudFrontOriginAccessControlMap = Map<
  SimCloudFrontOriginAccessControlId,
  SimCloudFrontOriginAccessControl
>;

/**
 * Generate a fake sim CloudFront origin access control ID, in the shape
 * CloudFront gives one.
 */
export function makeOriginAccessControlId(): SimCloudFrontOriginAccessControlId {
  return faker.helpers.fromRegExp(
    /E[0-9A-Z]{13}/,
  ) as SimCloudFrontOriginAccessControlId;
}
