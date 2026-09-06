# Prehospital blood custody tracker

Replaces a paper form (Stony Brook Medicine, "CPBBT Prehospital Operations —
Inventory Management Log", Reference # 17247 2 2) with a phone-based scan-and-log
system for flight medics, plus a live inventory view for the blood bank.

Status: prototype. Solo side project, tested by the author only, intended to be
pitched to EMS supervision and the blood bank once it demos well.

---

## The real-world workflow

The blood bank issues **two units of O Neg red cells** to a remote airport
location (MacArthur, sometimes Gabreski) and fills in the top of the paper form.
The units live in a fridge at that location.

0. Both units, packed in one TIC, sit in the fridge at the hangar.
1. A call comes in.
2. The flight medic packs both units into the TIC, and the TIC into the cooler.
3. One of three things happens:
   - **(a)** No transfusion — the intact cooler (TIC, both units) returns to base.
   - **(b)** One unit is transfused; the patient is transported.
   - **(c)** Both units are transfused; the patient is transported.
4. **In (b) and (c) — the common case, not the exception — at the home
   hospital (99% of the time) the medic hands over whatever's left in the
   TIC (the unused unit in case (b); nothing in case (c)) to that hospital's
   blood bank, and receives a fresh two-unit consignment in exchange.** The
   new pair gets packed into the same TIC and cooler and carried back to the
   hangar fridge. If the flight isn't at the home hospital, it flies there
   first for this swap.

So "whatever wasn't used goes straight back to the hangar fridge" is only
true for outcome (a). The far more common path — any transfusion at all —
routes through a hospital-side consignment swap before anything returns to
the hangar. **The app must be able to log that swap**: closing out whatever
was left in the TIC to the receiving blood bank, and receiving/packing a
brand-new consignment away from the hangar.

Every removal and return is hand-documented on the form: date, time, visual
inspection pass/fail, initials, TIC check pass/fail, cooler number, and
REM/RET checkboxes. Terminal outcomes are transfused (with MRN), returned to the
blood bank, or discarded.

### Equipment vocabulary — this tripped up the first design

- **Soft cooler** — the outer carrier. Numbered. Stays with the aircraft.
- **TIC** — *thermal insulated container*. A **numbered insert that sits inside
  the cooler**. The blood goes in the insert. NOT a temperature indicator tag.
- A **TIC check** is an equipment check: seal, coolant, condition.
- **A failed TIC check does not condemn the blood.** The medic rotates in a
  different numbered insert (e.g. TIC 4 out, TIC 3 in) and carries on. This can
  happen out on transport, not just at pack-out.
- Per the author: TIC failures have never yet allowed an out-of-temp excursion.
  So there is deliberately **no time-and-temp branch**. Keep the pass/fail record
  and the manual escalation flag so that assumption stays checkable.

### The pair rule

Both units travel together in **one TIC inside one cooler**. They are a matched
pair for *movement* and separate for *documentation*:

- **Grouped** — TIC number, cooler number, TIC check. There is one insert and one
  container; asking twice is asking the same question twice.
- **Per unit** — visual inspection (each bag separately; one can fail while the
  other travels), transfusion, MRN, discard, quarantine, and the whole custody
  chain.

Only one unit may be used on a call. The other comes back. The app must handle
that asymmetry without the medic having to think about it.

**Test for correctness:** pull one unit's events out of the log and the record
must read completely on its own, with no reference to the other unit.

---

## Data model

Append-only event log. Current state is **derived by replaying events, never
stored**. Nothing is ever edited or deleted; corrections are new linked rows.
This mirrors the paper amendment procedure (struck-through row, circled initials)
and is what makes the QA review box meaningful.

```
units        unit_number, product_code, abo_rh, expires, consignment_id
events       unit_id, type, at, medic_id, batch_id, detail (jsonb)
amendments   event_id, reason, signed_by, at
```

Event types: `ISSUE`, `REM`, `TIC_SWAP`, `RET`, `QUARANTINE`, `TRANSFUSE`,
`DISCARD`, `RETURN_BB`, `FLAG`.

A pack-level action writes one event **per unit** sharing a `batch_id`. The
batch tag is a convenience for grouping in the UI; delete it and every unit's
chain still stands alone.

### State machine

```
IN_FRIDGE ⇄ IN_COOLER
    │           │
    │           ├─→ TRANSFUSED  (terminal)
    │           ├─→ DISCARDED   (terminal)
    │           └─→ RETURNED_BB (terminal) — e.g. a leftover unit handed to
    │                            a hospital blood bank at a consignment swap
    ├─→ RETURNED_BB (terminal)
    └─→ QUARANTINE ─→ DISCARDED
```

Forcing functions that fall out of this:

- Can't remove a unit already out, or return one that isn't out.
- `REM` requires visual inspection pass + TIC number + TIC check pass + cooler.
- `RET` requires a TIC check.
- Visual inspection fail → quarantine; cannot go back to storage or to a patient.
- TIC check fail → insert rotation, **not** quarantine.
- **Accounting guarantee: every issued unit must reach a terminal state.** The
  blood bank dashboard surfaces anything that hasn't.

---

## What already exists

| File | What it is |
|---|---|
| `isbt.js` | ISBT-128 unit-number parser. Tested, self-contained, port as-is. |
| `index.html` | Standalone scanner test page. Source of the working scanner settings — now ported into the real app as `Scanner` (`src/app/_components/scanner.tsx`), wired into `ScanRow` and `ReceiveConsignment`. Kept as a lightweight standalone harness for isolated scanner debugging. |
| `blood-custody-log-v2.jsx` | React prototype of the full medic flow. In-memory only. Design reference for screens and copy. |
| paper form photos | Every field on them has to land somewhere. |

### Hard-won scanner details — do not rewrite from memory

- **`zxing-wasm` 3.1.3**, not `@zxing/library`. The pure-JS one could not read
  these labels at all.
- Module is at `dist/es/reader/index.js`; the wasm binary is at
  `dist/reader/zxing_reader.wasm`. **Different directories.** The default
  relative lookup misses, so `locateFile` must be overridden. Getting this wrong
  produces a silent "decoder failed to load".
- v3 defaults `tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale` to true.
  Leave `formats` unset to allow all readable formats — an explicit empty array
  may mean "none".
- Live scanning decodes a **centre band (~42% of frame height) at native
  resolution**. Handing the decoder a downscaled full frame does not work on
  dense ISBT symbols.
- Request `width: 1920, height: 1080` and `focusMode: continuous`. Default
  streams are often 640×480, which cannot resolve these barcodes.
- Prefer the plain wide rear lens; tele and ultrawide focus poorly this close.
- **Keep the full-resolution photo fallback.** It succeeds on curved labels when
  the live stream can't lock on, and it is the reason the scanner works at all.
- **Never swallow exceptions in decode paths.** An early version reported
  "no barcode found" for what was actually a broken wasm path, and it cost a
  field trip to discover.
- iOS: `playsInline` on the video element, HTTPS mandatory, permission recovery
  is buried in Settings — so **manual unit-number entry must always remain
  available**. The app must never be able to block a launch.

### ISBT-128 label facts

Four barcodes sit within about an inch of each other. **Only the unit number
(DIN) is needed** — donor and product details are documented elsewhere in the
chart and are not part of cold chain tracking.

```
Printed:  W1833 26 337371 8[5]
Scanned:  =W18332633737100

=        data identifier
W1833    facility
26       collection year
337371   serial
00       flag characters — 00 undivided; non-zero identifies a division
```

- The `8` and boxed `5` are **manual-entry check characters computed from the
  number**. They are not in the barcode. Relevant only if hand-keyed entry gets
  validation later.
- Matching keys on facility + year + serial and **ignores flag characters**, so
  the same unit matches whether they're present or not.
- Parsing is deliberately strict on length. A single stray trailing digit is
  rejected rather than guessed at — a misread unit number is the one failure mode
  with real consequences.
- Product code, ABO/Rh and expiry barcodes are recognized **only** to tell the
  medic they scanned the wrong one. Their data identifiers: `=<` for product code
  (confirmed); `=%` and `=&` inferred, unverified, and only affect error wording.

---

## Design decisions worth preserving

- **The app infers the action.** It never asks "are you removing or returning?"
  It replays history and offers only what's legal right now.
- **MRN is the primary field on transfusion**, per the paper form. A fallback
  captures an incident number when the MRN isn't yet assigned, flagging the record
  for reconciliation. If medics always have the MRN at point of care, cut it.
- **Manual escalation flag** on every open unit — a signed note, no state change,
  surfacing in the blood bank's exception queue. Exists so a medic who sees
  something wrong has somewhere to put it, rather than the app implying all is
  well because no checkbox fired.
- **Signing:** 4-digit PIN per medic. Not real security; it demos the signed-entry
  concept in one tap. Swap for real auth later.
- **Copy is written for someone holding a blood bag**, not for a log. Errors say
  what to do next.

---

## Build plan

**Stack:** Next.js on Vercel, Postgres (Neon or Supabase free tier), offline-first
PWA. One repo, one deploy.

**v1**
1. Medic flow against a real database — pack out, pack in, TIC rotation,
   per-unit transfuse/discard/return, custody log.
2. Real scanning via `isbt.js` + the zxing-wasm settings above.
3. Blood bank dashboard: every unit, its state, time out of fridge, expiry
   countdown; exception queue; daily reconciliation export.
4. Offline queue — a hangar is not a guaranteed-signal environment, and the medic
   leaves with blood either way. Record both device and server timestamps and
   flag entries captured offline.

**Deferred to v2:** WellSky integration, fridge temperature telemetry, ESO/chart
linkage, real auth.

### What sells this to the blood bank

Not the medic form — the **dashboard**. Today they get a paper log back at the end
of a consignment and have to trust it. Showing them a live screen with unit
location, elapsed time out of the fridge, and days to expiry is the pitch.
Second-best argument: numbered TICs make "insert 4 has failed three times this
month, pull it from service" a queryable fact the paper form cannot produce.

**Demo script:** seed the real consignment (two O Neg, E0336, issued 8/25/26 0836
by K. Reagan, expiring 9/17/26). Pack out both units → dashboard updates live →
mark one transfused, return the other → generate the reconciliation report in the
same layout as the paper form. Five minutes, ending on the artifact the blood bank
already knows how to read.

---

## Open questions

For the blood bank:

- Can WellSky accept an inbound feed, or is reconciliation a report a tech reads
  and keys in? **This determines how much manual work actually disappears** and
  should be answered before the backend is designed.
- Are divided units ever issued to a remote location? If never, flag characters
  stay decorative. If ever, the flag becomes part of unit identity and the match
  key must include it.
- Is `E0336` on the form genuinely the first five characters of `E0336V00`?
- Do the TIC inserts carry ID numbers in a scheme worth recording formally?

For ops:

- Do medics reliably have the MRN at the point of care?

---

## Regulatory note

Irrelevant to a prototype tested by one person. Relevant the day someone says yes:
as a system of record this falls under 21 CFR Part 11 (electronic signatures) and
21 CFR 606.160 (records, ten-year retention). It would need a validation protocol,
an SOP, and change control owned by lab QA rather than EMS ops, and should run in
parallel with paper until the blood bank signs off.

**Never commit real MRNs or patient data to this repo.** Unit numbers and TIC
numbers are inventory identifiers and are fine. Seed data must use invented MRNs.
