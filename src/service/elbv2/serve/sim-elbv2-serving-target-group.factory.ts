import { AsyncMappedFactory } from "@kensio/part-factory";

import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { createFixtureLambdaTargetGroup } from "../sim-elbv2.fixture.js";
import type { SimElbV2TargetGroup } from "../target-group/sim-elbv2-target-group.js";
import type { SimElbV2Event, SimElbV2Result } from "./sim-elbv2-event.type.js";
import { simElbV2ServicePrincipal } from "./sim-elbv2-invoke-authorizer.js";

/**
 * The statement id the invoke permission is granted under.
 */
export const simElbV2InvokeStatementId = "elb-invoke";

/**
 * The function code a target group holds when a test does not care what it
 * answers, only that something did.
 */
export function simElbV2CheckoutHandler(): SimElbV2Result {
  return { statusCode: 200, body: "checkout" };
}

/**
 * What a test asks for when it wants a target group that answers.
 */
export interface SimElbV2ServingTargetGroupInput {
  /**
   * The name the function takes, and which the target group takes with `-tg`
   * on the end.
   */
  readonly name: string;
  /** The function code the target group hands its requests to. */
  readonly handler: (event: SimElbV2Event) => unknown;
}

/**
 * Creates a `lambda` target group holding a function that answers, through the
 * ordinary commands.
 *
 * A target group that serves is four commands rather than one: the function,
 * the group, the invoke permission and the registration. A test about routing a
 * request to one of several groups is about none of them, and it needs more
 * than one group, so building one is done here.
 *
 * Everything is created in the default Account and Region of the simulated AWS
 * it is given, because real ELB requires a Lambda target to be in the same
 * Account and Region as its target group.
 */
export const simElbV2ServingTargetGroupFactory = new AsyncMappedFactory<
  SimElbV2ServingTargetGroupInput,
  SimElbV2TargetGroup,
  SimAws
>(
  () => ({ name: "checkout", handler: simElbV2CheckoutHandler }),
  async (input, simAws) => {
    const simLambda = simAws.lambda();
    const { FunctionArn } = await simLambda.createFunction({
      input: {
        FunctionName: input.name,
        Role: `arn:aws:iam::888888888888:role/${input.name}-role`,
        Code: { ZipFile: makeLambdaZipFileInput(input.handler) },
      },
    });

    const elbV2 = simAws.elbV2();
    const groupArn = await createFixtureLambdaTargetGroup(
      elbV2,
      `${input.name}-tg`,
    );

    await simLambda.addPermission({
      input: {
        FunctionName: input.name,
        StatementId: simElbV2InvokeStatementId,
        Action: "lambda:InvokeFunction",
        Principal: simElbV2ServicePrincipal,
        SourceArn: groupArn,
      },
    });

    await elbV2.registerTargets({
      input: { TargetGroupArn: groupArn, Targets: [{ Id: FunctionArn }] },
    });

    // A target group CreateTargetGroup reported is one the store holds, so
    // this is only missing if something is wrong with the simulator itself.
    const targetGroup = elbV2.findTargetGroupByArn(groupArn);
    assertDefined(
      targetGroup,
      `Simulated ELBv2 created the target group ${groupArn} and then did ` +
        `not hold it`,
    );

    return targetGroup;
  },
);
