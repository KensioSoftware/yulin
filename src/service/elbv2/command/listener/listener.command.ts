import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimElbV2ListenerView } from "../../listener/sim-elbv2-listener.js";
import type {
  SimElbV2ActionInput,
  SimElbV2Certificate,
  SimElbV2Tag,
} from "../sim-elbv2-shared.command.js";

/**
 * Minimal structural sim ELBv2 CreateListener command.
 */
export interface SimCreateListenerCommand {
  readonly input: SimCreateListenerCommandInput;
}

/**
 * Minimal structural sim ELBv2 CreateListener input.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateListener.html
 */
export interface SimCreateListenerCommandInput {
  readonly LoadBalancerArn?: string | undefined;
  readonly Protocol?: string | undefined;
  readonly Port?: number | undefined;
  readonly SslPolicy?: string | undefined;
  readonly Certificates?: readonly SimElbV2Certificate[] | undefined;
  readonly DefaultActions?: readonly SimElbV2ActionInput[] | undefined;
  readonly Tags?: readonly SimElbV2Tag[] | undefined;
}

/**
 * Minimal structural sim ELBv2 CreateListener output.
 */
export interface SimCreateListenerCommandOutput {
  readonly Listeners?: readonly SimElbV2ListenerView[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DescribeListeners command.
 */
export interface SimDescribeListenersCommand {
  readonly input: SimDescribeListenersCommandInput;
}

/**
 * Minimal structural sim ELBv2 DescribeListeners input.
 */
export interface SimDescribeListenersCommandInput {
  readonly LoadBalancerArn?: string | undefined;
  readonly ListenerArns?: readonly string[] | undefined;
  readonly Marker?: string | undefined;
  readonly PageSize?: number | undefined;
}

/**
 * Minimal structural sim ELBv2 DescribeListeners output.
 */
export interface SimDescribeListenersCommandOutput {
  readonly Listeners?: readonly SimElbV2ListenerView[] | undefined;
  readonly NextMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 ModifyListener command.
 */
export interface SimModifyListenerCommand {
  readonly input: SimModifyListenerCommandInput;
}

/**
 * Minimal structural sim ELBv2 ModifyListener input.
 */
export interface SimModifyListenerCommandInput {
  readonly ListenerArn?: string | undefined;
  readonly Protocol?: string | undefined;
  readonly Port?: number | undefined;
  readonly SslPolicy?: string | undefined;
  readonly Certificates?: readonly SimElbV2Certificate[] | undefined;
  readonly DefaultActions?: readonly SimElbV2ActionInput[] | undefined;
}

/**
 * Minimal structural sim ELBv2 ModifyListener output.
 */
export interface SimModifyListenerCommandOutput {
  readonly Listeners?: readonly SimElbV2ListenerView[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DeleteListener command.
 */
export interface SimDeleteListenerCommand {
  readonly input: SimDeleteListenerCommandInput;
}

/**
 * Minimal structural sim ELBv2 DeleteListener input.
 */
export interface SimDeleteListenerCommandInput {
  readonly ListenerArn?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 DeleteListener output.
 */
export interface SimDeleteListenerCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
