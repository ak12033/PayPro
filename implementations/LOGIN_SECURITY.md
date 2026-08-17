# PayPro — location-aware login security

Record of what was built and why. The implementation is in `server/services`,
`server/models` and `client/src`; rationale that belongs next to code lives in
the code.

---

## 1. What was there before

One comparison, in `authController.login`:

```js
const isNewLocation =
    !user.lastLoginLocation?.city ||
    (currentLoc.city && currentLoc.city !== 'Unknown' &&
     user.lastLoginLocation.city !== currentLoc.city);
```

`user.lastLoginLocation` is a single city on the user document, overwritten by
whichever device signed in last. That has three consequences, and all three are
worse than they look.

**It challenged people for owning two devices.** Sign in on the phone, and the
stored city becomes wherever the phone was. Sign in on the laptop, and the
comparison runs against the phone's city. On a multi-device account the check
fires in both directions, forever, and each fire costs an email round trip.

**It challenged on city names, which move without the user.** IP geolocation
resolves to a provider's city centroid, not to a person. A DHCP lease change
moves a stationary user from "New Delhi" to "Noida", 25 km away — indisputably a
different city string, indisputably the same room.

**It could not tell a device apart at all.** A first-time login from an
attacker's machine in the user's own city passed without a challenge, because
the only question asked was about the city. The single most informative signal
available — *have we ever seen this browser before* — was not collected, stored
or consulted.

The net effect was a system that interrupted legitimate users on a schedule set
by their ISP while waving through the case it was ostensibly built to catch.

---

## 2. The shape of the replacement

Seven services, each with one job, wired together by one orchestrator:

| Service | Responsibility |
| --- | --- |
| `deviceFingerprintService` | Turn a request into three keyed hashes; score how well two devices match |
| `locationService` | Resolve an IP to a place; measure distance; classify proximity; detect impossible travel |
| `riskEvaluationService` | Pure function: signals in, score and decision out |
| `trustedDeviceService` | The device book — find, observe, confirm, trust, revoke, expire |
| `loginHistoryService` | Record and query sign-ins |
| `twoFactorService` | Mint, bind, resend and consume challenges |
| `loginSecurityService` | Orchestration: `assessLogin`, `finalizeLogin`, `enrollDevice` |

The controller asks one question and acts on one answer. Every threshold,
weight and rule lives in `config/security.js`; no service hard-codes policy.

---

## 3. Decisions worth defending

### 3.1 Three fingerprints, not one

A single fingerprint is brittle in exactly the way that hurts most. Any one
component changing — an external monitor, an interface language, a flight
across time zones — produces a completely different digest, the device reads as
brand new, and the user is challenged for doing nothing. Users challenged for
nothing stop reading challenges, and a security prompt that is always ignored is
worse than no prompt at all: it costs the same and protects nothing.

So the components are hashed three times over different subsets:

- **full** — everything. An exact match is conclusive.
- **core** — the machine underneath: OS family, platform, CPU count, memory,
  touch support. Survives changing browser, screen and time zone.
- **browser** — the software on top: browser family, OS family, device type,
  language. Survives changing machine.

Matching core *and* browser while full differs is the signature of ordinary
drift, and is accepted as the same device (score 0.85, threshold 0.85). Matching
only one is not: a new browser on the same laptop (0.5) and the same browser on
a different laptop (0.35) are genuinely different devices and are both
challenged.

Version numbers are excluded everywhere. Including them would challenge every
user on Chrome's four-week release cadence — a fingerprint invalidated by the
vendor's release schedule, which is the fastest way to train people to click
through prompts.

### 3.2 Two mechanisms for the decision, on purpose

The brief asks for both a hard trigger list (§4) and a configurable score (§9).
They are kept as two mechanisms because they answer different questions.

A score alone cannot express a rule that must never be traded away. An
unrecognised device (+40) at the user's own desk (−20) scores 20, comfortably
under any sane threshold — and "we have never seen this computer before" is
precisely when a second factor is worth asking for.

So: **hard triggers are policy, the score is judgement, and 2FA fires when
either does.** Each hard trigger can be switched off individually
(`RISK_HARD_NEW_DEVICE=false`) for a deployment that wants the arithmetic to
have the final word.

### 3.3 Distance, not administrative boundaries

Noida and Delhi are different cities in different states, twenty-five kilometres
apart. A tier system built on name comparison calls that a state change and
challenges; a distance comparison calls it the same place and stays quiet. The
implementation compares coordinates first and falls back to names only when the
provider returns no coordinates.

Tiers: `same` (≤100 km) → `nearby` (≤200 km) → `different_city` →
`different_state` → `different_country`. Both radii are configurable; the brief's
suggested 100–200 km range is the default.

### 3.4 A known device is judged against itself

This is the whole multi-device story in one sentence. A known device is compared
against *its own* last known location; an unrecognised one against everywhere
the account has ever signed in.

A laptop that lives in Delhi turning up in Mumbai is a change for that laptop and
earns one challenge, even though the account's phone has been in Mumbai for
months. After verification, that laptop's location moves and the challenge does
not repeat — and no other device is touched. Impossible travel is evaluated the
same way, per device, so a phone in Mumbai and a laptop in Delhi are two facts
about one account rather than evidence of teleportation.

### 3.5 Nothing moves until the user has fully authenticated

`assessLogin` records a sighting and writes a history row. It does not touch
`lastSeenAt`, `loginCount` or a device's last known location. Only
`finalizeLogin` does, and it runs only after the password *and*, where demanded,
the second factor.

Without that ordering, an attacker who reaches the 2FA prompt and stops has
already moved the trusted device's location to their own city, and has refreshed
a lapsing trust by doing nothing. The test `leaves the device where it was when a
challenge goes unanswered` exists to keep that property nailed down.

For the same reason, "known location" is computed only from *completed* logins.
Counting challenged-but-unanswered attempts would let an attacker bootstrap
their own city into the victim's profile by failing to authenticate from it a few
times.

### 3.6 A code is bound to the login that requested it

A six-digit code authorising "the next login for this email address" is weaker
than it looks: an attacker phishing in real time submits it from their own
machine and is let in. The code proves someone received the email, not that the
person at the keyboard is the one who asked.

Every challenge therefore carries a `challengeId` (returned to the client that
started the login, required back on verification) and the device fingerprint it
was issued to. Both are checked *before* the code is consumed — otherwise a
request from the wrong device would burn the legitimate user's challenge, which
is a denial of service on their ability to log in at all. A resend keeps the
original context, so it cannot be used to re-point a pending login at a different
device.

### 3.7 Fingerprints are hashed with a key, not a bare digest

A SHA-256 of "Chrome | Windows | 1920x1080 | Asia/Kolkata" is reversible by
enumeration in seconds. An HMAC under a server-side key is not. The key is
scoped per user as well, so the same laptop shared by two accounts produces two
unrelated hashes and the database cannot correlate accounts by hardware. The
hash never leaves the server — the device list API returns an id and a label.

### 3.8 The signup device is trusted immediately

Someone who just chose the password on this browser is the account holder by
definition. Challenging that same browser on its next visit is theatre, and it
was the reason a brand-new user got an emailed code roughly sixty seconds after
registering.

### 3.9 The prompt says why

`{ reason: 'new_device' }` comes back with the 403 and the verification screen
renders it. This is worth the small amount it reveals — the reason codes are
already knowable by anyone who can read the policy. A user who is told "we did
not recognise this device" and knows they are on their usual laptop has been
handed the one piece of information that tells them something is wrong. "Additional
verification required" teaches them to click through.

---

## 4. Edge cases, and where each is handled

| Case | Behaviour |
| --- | --- |
| Cookies cleared | Fingerprint is attribute-derived, not cookie-derived. Unaffected. |
| Browser update | Versions excluded from the fingerprint. Silent. |
| OS update | Same. Silent. |
| Dynamic IP | Comparison is geographic, never IP equality. Silent. |
| Wi-Fi ↔ cellular | Usually inside the 100 km radius. Silent. |
| VPN / proxy | Scored (+30) and recorded; the location change it causes is what challenges. Hard trigger available, off by default — VPN use is common and legitimate. |
| Travelling | One challenge on arrival, then that device's location updates. |
| Shared computer | "Trust this device" is opt-in and off by default; verifying without it grants a session and nothing more. |
| Multiple devices | Unlimited, each with its own trust, location and counters. |
| Expired trust | Lapses after 90 days of inactivity, persisted on sight, re-trustable. |
| Slight fingerprint drift | Absorbed by the fuzzy match (+10 risk, no challenge). |
| New browser, same machine | New device. Challenged. |
| Same browser, new machine | New device. Challenged. |
| Geolocation provider down | Degrades to "unknown" — neither familiar nor suspicious. Device signals decide; a trusted device still gets through. |

---

## 5. Tests

`server/tests/riskEngine.test.js` — 42 unit tests over the three pure services:
distance and tier classification, impossible travel including the floors that
stop it misfiring, proxy detection, fingerprint stability across updates and
drift, every risk combination, and reconfiguration (weights, threshold, hard
triggers).

`server/tests/loginSecurity.test.js` — 45 integration tests through the HTTP
API, with geolocation stubbed at the one boundary where the system learns where
an IP is and everything above it real. Covers the brief's twelve scenarios plus
challenge integrity (cross-device replay, missing challenge id, code reuse,
resend binding, enumeration parity), history correctness, device management
authorisation, and degraded geolocation.

163 tests pass across the suite, including the 76 that existed before.

---

## 6. Configuration

All in `config/security.js`, all overridable by environment variable, documented
in `server/.env.example`. The values most likely to need moving in production:

```
LOGIN_SAME_LOCATION_RADIUS_KM=100    # 100-200 is the sensible band
TRUSTED_DEVICE_INACTIVITY_DAYS=90
LOGIN_RISK_THRESHOLD=50
RISK_HARD_SUSPECTED_PROXY=false
```

Tune the threshold while watching the challenge rate. The cost of getting it
wrong is asymmetric: too strict and users learn to click through prompts, too
loose and the prompts stop protecting anything.

---

## 7. Extending it

A new signal needs two things: a weight in `securityConfig.risk.weights` and an
`add()` call in `riskEvaluationService`. Signals computed outside the engine —
behavioural analysis, device reputation, a model score — need neither: pass them
to `evaluateLogin` as `extraSignals: [{ code, weight, detail, mandatory }]` and
they are scored alongside the built-in ones. The test
`accepts a caller-supplied signal, which is how future ones arrive` pins that
contract.

The IP reputation heuristic in `locationService.isSuspectedProxy` is a keyword
list and is deliberately conservative — a false positive challenges a real user
on their home broadband. Swapping in a commercial feed means replacing that one
function.
