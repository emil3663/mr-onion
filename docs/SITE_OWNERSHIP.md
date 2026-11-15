# Confirming you own a site, or may test it

Some of what Mr Onion can do should only ever be pointed at a site you own or
have written permission to test: sending attack-shaped input (active tests),
load testing, and running without its request limits. Testing someone else's
site that way, without permission, is unauthorised security testing, which is
illegal in most countries.

So Mr Onion asks you to confirm it, **once per site**. The confirmation is
saved with the site and used by every later run, so you aren't asked again on
each run. It is your statement: Mr Onion records it and can't check it.

> **Status (Phase 43, TFP-218):** the confirmation can be saved, read and
> withdrawn through the API below. What it unlocks comes in the rest of
> Phase 43: the active gate in TFP-219 and the lifted caps in TFP-220. Until
> those land, saving one changes no run.

---

## What it records

| Field | What it is |
| --- | --- |
| `hosts` | Every host it covers, typed in full: `shop.example.com`, not a URL and not a wildcard. If the site also uses `api.example.com`, type that too. |
| `basis` | `owner` ("I own this site") or `written-permission` ("I have written permission to test it"). |
| `wording` | The exact text you confirmed. Each basis has its own; the API gives it to you to show, and you send it back unchanged. |
| `name` | Who confirmed. |
| `contactEmail` | How to reach them. It stays in the local file: it is never in a report or an export, and nothing is sent to it. |
| `confirmedAt`, `expiresAt` | When it was confirmed, and when it expires. |
| `scopes` | The ticks: `active` (active tests) and `load` (load testing). |
| `withdrawnAt` | Set when you withdraw it. |

It is saved in Mr Onion's local data folder, at
`<data>/site-suites/<site>/ownership.json`, beside the site's other settings.
It is never in the repository.

### Which hosts it accepts

A host you type must be one the site uses. That is either the host of the
site's own address, or a host recorded in the page data of the site's saved
Standard suite, as a page's host or a request's (an API or asset host the
pages call). Anything else is refused as a probable typing error. The page data
is saved when Mr Onion generates the site's Standard suite, so generate one
first if you want to cover a host that only the pages reach.

There are no wildcards. `*.example.com` would cover hosts you never named, and
some of them may belong to someone else, such as a hosted service on a
customer subdomain.

---

## What each tick allows

- **Always, with a valid confirmation:** the covered hosts run without Mr
  Onion's request limits for remote sites (at most 3 workers sharing 5
  requests a second).
- **`active`:** the active gate may open on the covered hosts. A run still
  has to ask for active tests itself; a confirmation alone never makes a run
  send attack-shaped input.
- **`load`:** the opt-in load-testing run may run, once it exists.
- **Not the interactive gate.** Interactive tests (forms that submit) are
  turned on per run, as before, with no confirmation.

Local hosts (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost`, `*.test`) never
need a confirmation.

---

## Expiry and withdrawal

- A confirmation expires after **90 days** unless you choose another expiry,
  at most **1 year** from the date you confirm.
- An expired confirmation counts as absent. Confirm again to renew it.
- You can **withdraw** it at any time. From the next run on it counts as
  absent. It is kept, with the date you withdrew it, as a record of what was
  confirmed and when. Replacing a confirmation keeps the old one too.

---

## Practice sites

A hosted practice site counts as written permission **only when its
published terms explicitly allow attack-shaped or load testing**. Read them
first. If they don't say so, don't confirm it: the site still runs, capped,
with no active tests. Mr Onion can't read a site's terms, so this rule is part
of the text you confirm.

---

## The API

The confirmation screen comes with the app screens (Phase 46). Until then:

```http
GET  /api/site-ownership?baseUrl=https://shop.example.com
```

Returns its `status` (`missing`, `valid`, `expired` or `withdrawn`), the
`confirmation`, the `history` of earlier ones, and the `wording` for each
basis.

```http
POST /api/site-ownership
{
  "baseUrl": "https://shop.example.com",
  "hosts": ["shop.example.com", "api.example.com"],
  "basis": "owner",
  "wording": "<the owner wording, from GET, unchanged>",
  "name": "Tess Tester",
  "contactEmail": "tess@example.com",
  "expiresAt": "2027-02-13T00:00:00Z",
  "scopes": { "active": true, "load": false }
}
```

Creates or replaces it. `expiresAt` is optional (90 days), and so is
`scopes` (both off). If given, `expiresAt` is an ISO 8601 date (`2027-02-13`,
taken as midnight UTC) or a date-time with its zone (`2027-02-13T09:00:00Z`). A confirmation with a missing field, an untyped,
wildcard or unused host, wording that isn't its basis's text, an invalid
email or an expiry beyond 1 year is refused with a 400 that lists every
reason.

```http
POST /api/site-ownership/withdraw
{ "baseUrl": "https://shop.example.com" }
```

Withdraws it, at any time, an expired one too. A 404 means the site has no
confirmation, or it is already withdrawn.

A confirmation file that can't be read, or that holds a confirmation with a
field missing or of the wrong type, reads as no confirmation: it fails
closed.
