import { describe, expect, it } from "vitest";
import { cancelOutcome } from "@/lib/callRecorderCancel";

describe("cancelling a submission", () => {
  it("shows the receipt, not a cancellation, if the relay already accepted the call", () => {
    expect(cancelOutcome(409)).toBe("receipt");
  });

  it("still confirms a successful discard", () => {
    expect(cancelOutcome(200)).toBe("cancelled");
  });

  it("does not claim the call was cancelled if the relay cannot confirm the discard", () => {
    expect(cancelOutcome(404)).toBe("unconfirmed");
    expect(cancelOutcome(503)).toBe("unconfirmed");
  });
});
