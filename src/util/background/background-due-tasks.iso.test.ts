import { describe, expect, it } from "vitest";

import { BackgroundDueTasks } from "./background-due-tasks.js";

const nineOClock = new Date("2026-07-26T09:00:00.000Z");
const tenOClock = new Date("2026-07-26T10:00:00.000Z");
const elevenOClock = new Date("2026-07-26T11:00:00.000Z");

/**
 * A task for cases where only when it is released matters, not what it does.
 */
function nothingToDo(): Promise<void> {
  return Promise.resolve();
}

/**
 * A task that records that it ran, so ordering can be asserted on.
 */
function recordingTask(name: string, ran: string[]): () => Promise<void> {
  return async (): Promise<void> => {
    ran.push(name);

    await Promise.resolve();
  };
}

describe("BackgroundDueTasks", () => {
  it("holds a task until simulated time reaches it", () => {
    // Given a task queued for ten o'clock
    const queue = new BackgroundDueTasks();
    queue.add(tenOClock, nothingToDo);

    // When time has only reached nine o'clock
    // Then nothing is due, and the task is still waiting
    expect(queue.takeNextDueBy(nineOClock)).toBeUndefined();
    expect(queue.size).toBe(1);
  });

  it("releases a task once time reaches its due instant", () => {
    // Given a task queued for ten o'clock
    const queue = new BackgroundDueTasks();
    queue.add(tenOClock, nothingToDo);

    // When time reaches exactly ten o'clock
    const due = queue.takeNextDueBy(tenOClock);

    // Then the task comes out, and is no longer queued
    expect(due?.dueTime).toStrictEqual(tenOClock);
    expect(queue.size).toBe(0);
  });

  it("releases due tasks earliest first", async () => {
    // Given tasks queued out of due order
    const ran: string[] = [];
    const queue = new BackgroundDueTasks();
    queue.add(elevenOClock, recordingTask("eleven", ran));
    queue.add(nineOClock, recordingTask("nine", ran));
    queue.add(tenOClock, recordingTask("ten", ran));

    // When everything due by eleven o'clock is taken in turn
    let due = queue.takeNextDueBy(elevenOClock);
    while (due !== undefined) {
      // oxlint-disable-next-line no-await-in-loop
      await due.task();
      due = queue.takeNextDueBy(elevenOClock);
    }

    // Then they came out in due order, not the order they were queued
    expect(ran).toStrictEqual(["nine", "ten", "eleven"]);
  });

  it("keeps tasks due at the same instant in the order they were queued", async () => {
    // Given two tasks queued for the same simulated moment
    const ran: string[] = [];
    const queue = new BackgroundDueTasks();
    queue.add(tenOClock, recordingTask("first", ran));
    queue.add(tenOClock, recordingTask("second", ran));

    // When both are taken
    await queue.takeNextDueBy(tenOClock)?.task();
    await queue.takeNextDueBy(tenOClock)?.task();

    // Then they happen in a predictable order rather than an arbitrary one
    expect(ran).toStrictEqual(["first", "second"]);
  });

  it("has nothing to release when empty", () => {
    // Given an empty queue
    const queue = new BackgroundDueTasks();

    // When time moves on
    // Then nothing is due
    expect(queue.takeNextDueBy(elevenOClock)).toBeUndefined();
    expect(queue.size).toBe(0);
  });

  it("does not hand out its own due time to be mutated", () => {
    // Given a task queued for a due time the caller still holds
    const dueTime = new Date(tenOClock);
    const queue = new BackgroundDueTasks();
    queue.add(dueTime, nothingToDo);

    // When the caller mutates that Date
    dueTime.setFullYear(1999);

    // Then the queued task is still due when it was queued for
    expect(queue.takeNextDueBy(tenOClock)?.dueTime).toStrictEqual(tenOClock);
  });
});
