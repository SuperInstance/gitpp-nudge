# gitpp-nudge

> Setter-aware nudging for the git.pp fold. Author a nudge that reliably lands, and prove it converges.

## The problem this exists to solve

The fold is a read-then-write loop: read the state, write a record that moves
it. `override > task > witness` *is* the nudge mechanism — a nudge outranks
what came before.

But writing a nudge reliably requires knowing **who currently sets the key**,
because §5.2 breaks a same-class tie by ancestry first and id second. Parent
a nudge on the wrong record and it neither reliably wins nor reliably loses:

```
nudge 'a-nudge', id sorts BEFORE the winner  -> lands
nudge 'z-nudge', id sorts AFTER  the winner  -> silently discarded
```

Same record. Same kind. Same reason. Opposite outcome, decided by nothing but
the nudge's own id.

And the fold would not tell you the setter. `state` is a flat `{key: value}`;
provenance survived only where two records happened to *contest* a key, via
`conflicts[].winner`. So the keys with the most stable values were exactly the
ones where a nudge was hardest to write.

**Spec §5.6 fixes this**: `derive()` must also return `setters: {key: record id}`
for every key, contested or not. The fold already computed it and discarded it.

## What this repo is

- `src/nudge.mjs` — `nudge()`, `verifyNudge()`, `setterOf()`. Author a nudge
  parented on the current setter, then re-fold and **assert it landed**.
- `test/convergence.mjs` — a suite about **intent**, not state.

## The convergence suite

Every existing suite asks *"given these records, what is the state."* None can
express *"I wanted to nudge X and it did not happen"* — the user-side failure
mode, and a silent one.

This suite runs the same five-step loop twice:

```
nudge loop, SETTER-AWARE (the §5.6 way)
  1  status="wip"     -> "wip"     landed
  2  owner="me"       -> "me"      landed
  3  status="review"  -> "review"  landed
  4  status="done"    -> "done"    landed
  5  owner="casey"    -> "casey"   landed
  5/5 landed

nudge loop, BLIND (parent on the first record)
  1  status="wip"     -> "wip"     landed
  2  owner="me"       -> "me"      landed
  3  status="review"  -> "wip"     LOST
  4  status="done"    -> "wip"     LOST
  5  owner="casey"    -> "me"      LOST
  2/5 landed, 3 silently lost
```

The blind run is **expected to fail**, and the suite asserts that it does:

```
PASS  setter-aware loop converges (5/5)
PASS  blind loop provably loses nudges (3 lost)
PASS  setters strictly improve the loop (+3)
PASS  derive() exposes setters (spec §5.6)
```

That asymmetry is the point. A suite that only proved the happy path would
pass just as well against a fold that never nudged at all. Asserting the
failure is what makes the success mean something.

## Run it

```bash
git clone https://github.com/SuperInstance/gitpp-doctor ../gitpp-doctor
GITPP_DOCTOR_DIR=../gitpp-doctor node test/convergence.mjs
```

`git.pp-doctor` is the Python reference port. Any port implementing
`derive()` with `setters` works — the suite is about the protocol, not the
language.

## The three losses are the dangerous kind

In the blind run the state simply **stops moving**. No error, no conflict, no
exception. `status` stays `"wip"` across three successive attempts to change it
and the fold reports `conflicts: []` for the keys that never got contested.

An agent driving this loop would not notice. It wrote three records, got three
`201`s back, and moved on — which is precisely the "feed and nudge" loop
failing while looking healthy.

## How this builds on what already exists

| this | depends on |
|------|-----------|
| `gitpp-nudge` | [`git.pp-spec`](https://github.com/SuperInstance/git.pp-spec) §5.6 |
| | [`git.pp-doctor`](https://github.com/SuperInstance/git.pp-doctor) — reference `derive()` |
| | [`gitpp-fold-conformance`](https://github.com/SuperInstance/gitpp-fold-conformance) — fold *semantics* |
| | [`gitpp-hub-api`](https://github.com/SuperInstance/gitpp-hub-api) — where nudges would be written |
| | [`gitpp-oracle`](https://github.com/SuperInstance/gitpp-oracle) — continuous divergence ledger |

The suites are complementary, not competing:

- **leaf** encoding — do the ports hash a record identically?
- **fold** semantics — given records, is the state right?
- **nudge** convergence — given an intent, did the state *move*?

## Still to do

- Port `derive()`'s `setters` to the other four leaf ports. §5.6 is additive —
  no leaf or closure root changes — so no pinned digest moves, but the other
  ports do not return `setters` yet, so only the Python reference can drive
  this loop today. `d26-setter-provenance` now enforces it — **all 5 ports
  return `setters`; 26/26.** It was withheld for two rounds because it passed
  *vacuously*: the comparison stripped the setters VALUES, so a port returning
  the inverted-ancestry result compared equal to a correct one. That was the
  seventh time a comparison bug produced a green suite here, and it is now
  caught mechanically by [`negctl`](https://github.com/SuperInstance/negctl),
  which sabotages a port and requires the suite to fail.
- Extend the suite to assert the *blind* case against a real `override` nudge,
  which beats ancestry by class and therefore lands regardless of parent. The
  interesting case is same-class, and that is what is tested.
- Wire `verifyNudge` into the hub's write path so a nudge that fails to land is
  reported at write time rather than discovered later.
