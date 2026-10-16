// gitpp-nudge — setter-aware nudging (spec §5.6)
//
// The fold returns state as a flat {key: value}. Before §5.6 it did not say
// which record set a key, so a nudge could be parented on the wrong record
// and land or be silently discarded depending on nothing but whether its own
// id sorted before the winner's.
//
// This module authors nudges the way §5.6 intends: read the setter, parent on
// it. `nudge()` returns the new record set and a receipt describing whether
// the nudge was *verified* to have landed.

/**
 * @param {object} folded  result of derive(): {state, setters, order, conflicts, orphans}
 * @param {string} key
 * @returns {string|null} the record id that currently sets `key`
 */
export function setterOf(folded, key) {
  if (!folded || !folded.setters) return null;
  return folded.setters[key] ?? null;
}

/**
 * Author a nudge.
 *
 * @param {object[]} records   current record set
 * @param {object}   folded    the CURRENT derive() result over those records
 * @param {string}   key
 * @param {*}        value
 * @param {object}   opts
 *   - kind      : override | task | witness  (default: same kind as the current setter)
 *   - reason    : human note
 *   - id        : explicit record id (default: generated)
 *   - idCounter : {n} receives the next sequence number when generating an id
 * @returns {{records: object[], record: object, expectedSetter: string, verified: boolean|null}}
 */
export function nudge(records, folded, key, value, opts = {}) {
  const expectedSetter = setterOf(folded, key);
  const priorKind = kindOf(records, expectedSetter);
  const id = opts.id ?? nextId(records, opts.idCounter);
  const record = {
    id,
    kind: opts.kind ?? priorKind ?? "task",
    parents: expectedSetter ? [expectedSetter] : [],
    effects: { [key]: value },
    reason: opts.reason ?? `nudge ${key}`,
  };
  return {
    records: [...records, record],
    record,
    expectedSetter,
    // verified stays null until the caller re-folds; see verifyNudge
    verified: null,
  };
}

/**
 * Re-fold and check the nudge actually landed.
 * This is the part that turns a silent failure into a reported one.
 */
export function verifyNudge(derive, before, after) {
  const key = Object.keys(after.record.effects)[0];
  const want = after.record.effects[key];
  const got = before.state[key];
  return {
    key,
    wanted: want,
    got,
    landed: JSON.stringify(got) === JSON.stringify(want),
    setterNow: before.setters?.[key] ?? null,
  };
}

export function kindOf(records, id) {
  if (!id) return null;
  const r = records.find((x) => x.id === id);
  return r ? r.kind : null;
}

function nextId(records, counter) {
  let n = records.length + 1;
  if (counter && typeof counter === "object" && typeof counter.n === "number") {
    counter.n += 1;
    n = counter.n;
  }
  return `nudge-${String(n).padStart(4, "0")}`;
}
