import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";

/**
 * What an update can replace on a Stack's deploy context. Anything it leaves
 * out, the Stack goes on using.
 */
export interface SimCfnStackUpdateContext {
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly caller?: SimAwsCaller | undefined;
  readonly assetsCaller?: SimAwsCaller | undefined;
}

/**
 * What a Stack is deploying from, and who it is deploying as.
 *
 * These three travel together and are the only things an update replaces, so
 * they are held apart from the rest of a Stack's Resource operations. An
 * operation reads them here whenever it runs, rather than closing over the
 * values the deployment started with.
 */
export class SimCfnStackDeployContext {
  /** The CDK cloud assembly the Stack's template was synthesized into. */
  public cdkOutContext: SimCdkOutContext | undefined;

  /** The principal the Stack's Resource work is authorized as. */
  public caller: SimAwsCaller | undefined;

  /** The principal the Stack's CDK file assets are published as. */
  public assetsCaller: SimAwsCaller | undefined;

  constructor(properties: SimCfnStackUpdateContext) {
    this.cdkOutContext = properties.cdkOutContext;
    this.caller = properties.caller;
    this.assetsCaller = properties.assetsCaller;
  }

  /**
   * Take on what an update brings with it, for this and every later operation.
   *
   * A synthesis writes the template and the assets manifest beside it together,
   * so a Stack updated from a re-synthesized template needs the manifest that
   * came with it. Keeping the one the Stack was deployed from would look up the
   * asset a replaced Resource names in a manifest written before it existed.
   *
   * An update naming a caller runs as that one, and the Stack is torn down as
   * it afterwards. An update that names none keeps the deployment's caller, so
   * a Stack updated from a plain template path goes on running as whoever
   * deployed it.
   */
  useUpdate(properties: SimCfnStackUpdateContext): void {
    this.cdkOutContext = properties.cdkOutContext ?? this.cdkOutContext;
    this.caller = properties.caller ?? this.caller;
    this.assetsCaller = properties.assetsCaller ?? this.assetsCaller;
  }

  /**
   * The principal file assets are published as, which is the deployment's own
   * caller unless the deployment named one for publishing.
   */
  publishingCaller(): SimAwsCaller | undefined {
    return this.assetsCaller ?? this.caller;
  }
}
