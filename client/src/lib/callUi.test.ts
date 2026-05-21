import assert from "node:assert/strict";
import test from "node:test";

import { getPrimaryCallActionLabel, getSecondaryCallActionLabel } from "./callUi.ts";

test("incoming ringing calls show Answer and Reject labels", () => {
  const activeCall = {
    direction: "incoming",
    status: "ringing",
  } as const;

  assert.equal(getPrimaryCallActionLabel(activeCall), "Answer");
  assert.equal(getSecondaryCallActionLabel(activeCall), "Reject");
});
