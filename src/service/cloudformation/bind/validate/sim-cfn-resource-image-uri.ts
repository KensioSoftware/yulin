import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

/**
 * The container image a synthesized Resource runs.
 *
 * Only AWS::Lambda::Function names one, on `Code.ImageUri`. Resource
 * Properties have already had Parameters and intrinsic functions resolved by
 * the time the Stack builds its Resources, so an image URI built by Fn::Sub or
 * from a Parameter reads here as the string it resolved to. Anything else,
 * including a template that is wrong about the shape of Code, has no image URI
 * for a binding to match.
 */
export class SimCfnResourceImageUri {
  private readonly resource: SimCfnResource;

  constructor(resource: SimCfnResource) {
    this.resource = resource;
  }

  /**
   * The resolved image URI, if this Resource is a function that names one.
   */
  value(): string | undefined {
    if (this.resource.type !== "AWS::Lambda::Function") {
      return undefined;
    }

    const code = this.resource.properties["Code"];

    if (code === null || typeof code !== "object" || Array.isArray(code)) {
      return undefined;
    }

    const imageUri = code["ImageUri"];

    if (typeof imageUri !== "string") {
      return undefined;
    }

    return imageUri;
  }
}
