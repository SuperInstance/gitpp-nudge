#!/usr/bin/env node
// The convergence suite: express an INTENT, assert it LANDED.
//
// Every existing suite tests "given these records, what is the state".
// None of them can express "I wanted to nudge X and it did not happen" --
// which is the user-side failure mode, and a silent one.
//
// This suite is about intent, not state. It runs the same nudge loop twice:
// once authoring nudges the way §5.6 intends (parent on the setter), and
// once the way an agent would if it could not see the setter. The second
// run is expected to LOSE nudges, and losing is the point: it is the
// failure this repo exists to make visible.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { nudge, verifyNudge, setterOf } from "../src/nudge.mjs";

const DOCTOR = process.env.GITPP_DOCTOR_DIR || "../gitpp-doctor";
const havePython = spawnSync("python3", ["-c", "print(1)"]).status === 0
  && spawnSync("python3", ["-c", `import sys; sys.path.insert(0,"${DOCTOR}"); import gitpp_doctor`]).status === 0;

if (!havePython) {
  console.error(`  need gitpp-doctor at ${DOCTOR} (set GITPP_DOCTOR_DIR)`);
  process.exit(2);
}

function derive(records) {
  const py = `
import sys, json
sys.path.insert(0, ${JSON.stringify(DOCTOR)})
import gitpp_doctor
print(json.dumps(gitpp_doctor.derive(gitpp_doctor.loads(sys.stdin.read())["records"])))
`;
  const r = spawnSync("python3", ["-c", py], {
    input: JSON.stringify({ records }), encoding: "utf8", maxBuffer: 1 << 24,
  });
  if (r.status !== 0) throw new Error(r.stderr.slice(0, 300));
  return JSON.parse(r.stdout);
}

const SEED = [{ id: "t1", kind: "task", parents: [], effects: { status: "todo", owner: null }, reason: "filed" }];
const SCRIPT = [
  ["status", "wip"], ["owner", "me"], ["status", "review"],
  ["status", "done"], ["owner", "casey"],
];

function run(aware) {
  let recs = [...SEED];
  const log = [];
  SCRIPT.forEach(([key, value], i) => {
    const before = derive(recs);
    if (aware) {
      const n = nudge(recs, before, key, value, { id: `n${String(i + 1).padStart(3, "0")}` });
      recs = n.records;
    } else {
      // blind: parent on the first record, which is all an agent can reach for
      recs = [...recs, { id: `n${String(i + 1).padStart(3, "0")}`, kind: "task",
                         parents: ["t1"], effects: { [key]: value }, reason: "nudge" }];
    }
    const after = derive(recs);
    const v = verifyNudge(derive, after, { record: recs[recs.length - 1] });
    log.push({ step: i + 1, key, want: value, got: v.got, landed: v.landed });
  });
  return log;
}

let failures = 0;

console.log("nudge loop, SETTER-AWARE (the §5.6 way)");
const aware = run(true);
for (const s of aware) {
  if (!s.landed) failures++;
  console.log(`  ${s.step}  ${s.key}=${JSON.stringify(s.want)} -> ${JSON.stringify(s.got)}  ${s.landed ? "landed" : "LOST"}`);
}
const awareLanded = aware.filter((s) => s.landed).length;
console.log(`  ${awareLanded}/${aware.length} landed\n`);

console.log("nudge loop, BLIND (parent on the first record)");
const blind = run(false);
for (const s of blind) {
  console.log(`  ${s.step}  ${s.key}=${JSON.stringify(s.want)} -> ${JSON.stringify(s.got)}  ${s.landed ? "landed" : "LOST"}`);
}
const blindLanded = blind.filter((s) => s.landed).length;
const blindLost = blind.length - blindLanded;
console.log(`  ${blindLanded}/${blind.length} landed, ${blindLost} silently lost\n`);

console.log("assertions");
const a = awareLanded === aware.length;
console.log(`  ${a ? "PASS" : "FAIL"}  setter-aware loop converges (${awareLanded}/${aware.length})`);
if (!a) failures++;

const b = blindLanded < blind.length;
console.log(`  ${b ? "PASS" : "FAIL"}  blind loop provably loses nudges (${blindLost} lost)`);
if (!b) failures++;

const c = awareLanded > blindLanded;
console.log(`  ${c ? "PASS" : "FAIL"}  setters strictly improve the loop (+${awareLanded - blindLanded})`);
if (!c) failures++;

const d = derive(SEED).setters !== undefined;
console.log(`  ${d ? "PASS" : "FAIL"}  derive() exposes setters (spec §5.6)`);
if (!d) failures++;

console.log(failures ? `\n${failures} assertion(s) failed` : "\nall assertions hold");
process.exit(failures ? 1 : 0);
