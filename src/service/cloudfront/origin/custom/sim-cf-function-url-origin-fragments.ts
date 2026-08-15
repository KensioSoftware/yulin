import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * What a test asks for when it wants the template CDK synthesizes for
 * `origins.FunctionUrlOrigin.withOriginAccessControl()`.
 *
 * Five Resources stand between a test and a Function URL served through a
 * Distribution, and each test about that shape is about one of them being
 * wrong, so each field here is one thing a template can get wrong on its own.
 */
export interface SimCfFunctionUrlOriginTemplateInput {
  /** How the origin access control signs, which is `always` in what CDK emits. */
  readonly signingBehavior: string;
  /**
   * Whether the Origin has an origin access control at all, since an Origin
   * without one is reached anonymously.
   */
  readonly originAccessControl: boolean;
  /**
   * Whether the template grants CloudFront the Function URL, which CDK always
   * does alongside the Distribution.
   */
  readonly permitted: boolean;
  /** The Distribution the permission is granted for. */
  readonly permissionSourceArn: SimCfnTemplateValue;
}

/**
 * The parts of the template a template can leave out.
 *
 * Each is a Resource, or a property of one, that CDK always writes and that a
 * hand-written template can forget. The origin access control contributes two,
 * which are both there or both absent, since an Origin naming one nothing
 * created would be refused rather than reached.
 */
export interface SimCfFunctionUrlOriginParts {
  readonly originAccessControl: SimCfnTemplateValueRecord;
  readonly originAccessControlId: SimCfnTemplateValueRecord;
  readonly invokePermission: SimCfnTemplateValueRecord;
}

/**
 * Build the optional parts of a Function URL Origin template.
 */
export function simCfFunctionUrlOriginParts(
  input: SimCfFunctionUrlOriginTemplateInput,
): SimCfFunctionUrlOriginParts {
  return {
    originAccessControl: included(input.originAccessControl, {
      SiteOac: {
        Type: "AWS::CloudFront::OriginAccessControl",
        Properties: {
          OriginAccessControlConfig: {
            Name: "site-oac",
            OriginAccessControlOriginType: "lambda",
            SigningBehavior: input.signingBehavior,
            SigningProtocol: "sigv4",
          },
        },
      },
    }),
    originAccessControlId: included(input.originAccessControl, {
      OriginAccessControlId: { Ref: "SiteOac" },
    }),
    // The permission CDK writes beside the Distribution, letting CloudFront
    // invoke the Function URL for that Distribution alone.
    invokePermission: included(input.permitted, {
      InvokeFromCloudFront: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
          Action: "lambda:InvokeFunctionUrl",
          Principal: "cloudfront.amazonaws.com",
          SourceArn: input.permissionSourceArn,
        },
      },
    }),
  };
}

/**
 * One fragment of the template, or nothing where the template omits it.
 */
function included(
  present: boolean,
  fragment: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  if (!present) {
    return {};
  }

  return fragment;
}
