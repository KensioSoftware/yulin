/**
 * The structural sim ELBv2 shapes more than one command carries.
 *
 * An action appears on a listener and on a rule, a certificate and a tag on
 * several creates, so they are written once here and imported rather than
 * repeated per command file.
 *
 * Every field is widened to the plainest type that still accepts a real SDK
 * command, so an input the simulation refuses is refused at runtime with an
 * explanation rather than by the type checker with none. That matters for
 * `Type` fields above all: the SDK's own union carries action types this
 * simulation does not have.
 */

/**
 * Minimal structural sim ELBv2 tag.
 */
export interface SimElbV2Tag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 certificate reference.
 */
export interface SimElbV2Certificate {
  readonly CertificateArn?: string | undefined;
  readonly IsDefault?: boolean | undefined;
}

/**
 * Minimal structural sim ELBv2 health check matcher.
 */
export interface SimElbV2Matcher {
  readonly HttpCode?: string | undefined;
  readonly GrpcCode?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 fixed-response action configuration.
 */
export interface SimElbV2FixedResponseActionConfig {
  readonly MessageBody?: string | undefined;
  readonly StatusCode?: string | undefined;
  readonly ContentType?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 redirect action configuration.
 */
export interface SimElbV2RedirectActionConfig {
  readonly Protocol?: string | undefined;
  readonly Port?: string | undefined;
  readonly Host?: string | undefined;
  readonly Path?: string | undefined;
  readonly Query?: string | undefined;
  readonly StatusCode?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 weighted target group.
 */
export interface SimElbV2TargetGroupTuple {
  readonly TargetGroupArn?: string | undefined;
  readonly Weight?: number | undefined;
}

/**
 * Minimal structural sim ELBv2 forward action configuration.
 */
export interface SimElbV2ForwardActionConfig {
  readonly TargetGroups?: readonly SimElbV2TargetGroupTuple[] | undefined;
}

/**
 * Minimal structural sim ELBv2 action.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_Action.html
 */
export interface SimElbV2ActionInput {
  readonly Type?: string | undefined;
  readonly Order?: number | undefined;
  readonly TargetGroupArn?: string | undefined;
  readonly ForwardConfig?: SimElbV2ForwardActionConfig | undefined;
  readonly FixedResponseConfig?: SimElbV2FixedResponseActionConfig | undefined;
  readonly RedirectConfig?: SimElbV2RedirectActionConfig | undefined;
}

/**
 * Minimal structural sim ELBv2 action as it is reported back.
 */
export interface SimElbV2ActionView {
  readonly Type: string;
  readonly Order?: number | undefined;
  readonly TargetGroupArn?: string | undefined;
  readonly ForwardConfig?: SimElbV2ForwardActionConfig | undefined;
  readonly FixedResponseConfig?: SimElbV2FixedResponseActionConfig | undefined;
  readonly RedirectConfig?: SimElbV2RedirectActionConfig | undefined;
}
