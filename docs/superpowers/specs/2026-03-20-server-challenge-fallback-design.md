# Server challenge fallback design

## Summary
Update the server challenge contract so responses include `selectedDate`, make `GET /api/challenges/today` return the challenge for the current calendar date when present, and fall back to a built-in challenge when no row exists for that date. Add a seed script that writes 50 deterministic challenges into MySQL.

## Goals
- Include `selectedDate` in every challenge response.
- Return today’s challenge when a row exists for today.
- Return a built-in fallback challenge when today’s row is missing.
- Provide a repeatable way to seed 50 challenge rows into the database.

## Non-goals
- Changing extension UI behavior beyond consuming the new response shape.
- Designing a large challenge-authoring system.
- Adding multiple fallback strategies.

## Data contract
The shared `Challenge` type will gain a new `selectedDate: string` field.

Returned challenge objects will distinguish between:
- `selectedDate`: the date the client asked for implicitly via `/today`.
- `date`: the date associated with the actual challenge payload.

For a normal hit, `selectedDate` and `date` will both be today.
For fallback, `selectedDate` will still be today, while `date` will remain the fallback challenge’s own stable date value.

Client behavior should treat `selectedDate` as the active requested day and `date` as metadata about which challenge payload was served. In other words, a fallback response still represents the playable challenge for today even though its payload came from the built-in fallback challenge.

The extension-side code that consumes the API response must be updated in the same change so the new `selectedDate` field is reflected consistently anywhere the shared contract is used.

## Route behavior
`GET /api/challenges/today` will:
1. Compute today’s date in `YYYY-MM-DD` format using the server’s current UTC date.
2. Query `challenges` for an exact row match on that date.
3. If found, parse `target_expressions` and `graph_data` exactly as the route already does.
4. If parsing succeeds, return the challenge with `selectedDate` added.
5. If not found, return a built-in fallback challenge object.

If a row exists for today but its JSON fields are invalid, the route should fail with `500` rather than silently substituting fallback content. Missing data uses fallback; malformed stored data remains an operational error.

The built-in fallback challenge will be defined directly in server code with concrete stable values:
- `id: 0`
- `date: "1970-01-01"`
- `targetExpressions: ["y=x"]`
- `graphData: { xRange: [-10, 10], yRange: [-10, 10] }`
- `selectedDate: today`

Its shape must exactly satisfy the existing `Challenge["graphData"]` contract used by both the server and extension. No fallback-only fields should be introduced.

The fallback will live in server code so it works even when the database is incomplete or empty.

## Seed script
Add a server-side seed script that inserts 50 deterministic challenge rows.

Seed behavior:
- Generate 50 concrete dates in a contiguous range anchored to a fixed start date in code.
- Make that fixed range include the current day for the present rollout, so normal `/today` requests resolve to seeded data after seeding.
- Generate simple but valid challenge payloads for each date.
- Write `date`, `target_expressions`, and `graph_data` in the existing schema format.
- Be safe to re-run by using the same fixed dates and upsert behavior instead of blind inserts.
- If the schema does not already enforce uniqueness on `challenges.date`, add that constraint as part of this work so upsert behavior is well-defined.

This keeps local and deployed databases easy to refresh without creating duplicate rows.

## Verification
Verify the change by:
1. Building the server package successfully.
2. Running the seed script against the configured database.
3. Confirming `/api/challenges/today` returns a seeded challenge when today exists, with `selectedDate === date`.
4. Temporarily removing today’s seeded row from a test database state, then confirming `/api/challenges/today` returns the built-in fallback with `selectedDate === requested today`, `date === "1970-01-01"`, and `id === 0`.
5. Confirming both responses include `selectedDate`.

## Files likely affected
- `packages/server/src/types.ts`
- `packages/server/src/routes/challenges.ts`
- `packages/server/package.json`
- new server seed script file(s)
