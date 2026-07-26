import { describe, expect, it } from "vitest";
import { assertIdentical } from "@kensio/smartass";
import { CreateUserCommand } from "@aws-sdk/client-iam";
import { SimAws } from "./sim-aws.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";

describe("SimAws", () => {
  it("returns same Account for same Account ID", () => {
    const simAws = new SimAws();

    assertIdentical(
      simAws.account("111111111111"),
      simAws.account("111111111111"),
    );
  });

  it("returns different Accounts for different Account IDs", () => {
    const simAws = new SimAws();

    const account1 = simAws.account("111111111111");
    const account2 = simAws.account("222222222222");

    assertIdentical(
      account1.region().region.regionName,
      account2.region().region.regionName,
    );
  });

  it("returns same Region for same Region name", () => {
    const simAws = new SimAws();

    assertIdentical(simAws.region("eu-west-1"), simAws.region("eu-west-1"));
  });

  it("returns different Regions for different Region names", () => {
    const simAws = new SimAws();

    const euWest1 = simAws.region("eu-west-1");
    const apSoutheast2 = simAws.region("ap-southeast-2");

    assertIdentical(
      euWest1.account().account.accountId,
      apSoutheast2.account().account.accountId,
    );
  });

  it("returns same Account Region scope regardless of selection order", () => {
    const simAws = new SimAws();

    assertIdentical(
      simAws.account("111111111111").region("eu-west-1"),
      simAws.region("eu-west-1").account("111111111111"),
    );
  });

  it("returns same default S3 from all default scope paths", () => {
    const simAws = new SimAws();

    assertIdentical(simAws.s3(), simAws.account().s3());
    assertIdentical(simAws.s3(), simAws.region().s3());
    assertIdentical(simAws.s3(), simAws.account().region().s3());
    assertIdentical(simAws.s3(), simAws.region().account().s3());
  });

  it("returns same default DynamoDB from all default scope paths", () => {
    const simAws = new SimAws();

    assertIdentical(simAws.dynamoDb(), simAws.account().dynamoDb());
    assertIdentical(simAws.dynamoDb(), simAws.region().dynamoDb());
    assertIdentical(simAws.dynamoDb(), simAws.account().region().dynamoDb());
    assertIdentical(simAws.dynamoDb(), simAws.region().account().dynamoDb());
  });

  describe("simulated time", () => {
    const instant = new Date("2026-07-26T09:30:00.000Z");

    it("reports the real time by default", () => {
      // Given a simulation with no clock of its own
      const simAws = new SimAws();

      // When its time is read
      const now = simAws.now();

      // Then it is the real system time
      expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(1000);
    });

    it("reports the time of an injected clock", () => {
      // Given a simulation whose clock is stopped at a known instant
      const simAws = new SimAws({ clock: new SimFixedClock(instant) });

      // When its time is read
      // Then it is that instant, not the host clock's
      expect(simAws.now()).toStrictEqual(instant);
    });

    it("stamps a created resource with simulated time", async () => {
      // Given a simulation whose clock is stopped at a known instant
      const simAws = new SimAws({ clock: new SimFixedClock(instant) });

      // When a resource that records a creation time is created
      const output = await simAws
        .iam()
        .createUser(new CreateUserCommand({ UserName: "Clockwatcher" }));

      // Then the resource is stamped with simulated time
      expect(output.User.CreateDate).toStrictEqual(instant);
    });

    it("keeps one simulation's time out of another's", () => {
      // Given two simulations, only one of which has a stopped clock
      const stopped = new SimAws({ clock: new SimFixedClock(instant) });
      const running = new SimAws();

      // When both report their time
      // Then each keeps its own: stopping one clock leaves the other running
      expect(stopped.now()).toStrictEqual(instant);
      expect(Math.abs(running.now().getTime() - Date.now())).toBeLessThan(1000);
    });
  });
});
