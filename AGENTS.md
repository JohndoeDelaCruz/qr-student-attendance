<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Student data

- Use student records supplied by the project owner. Do not seed or insert fabricated/demo students into the app or hosted Supabase project.
- The owner supplied a student roster in an Excel workbook. Inspect and validate that source before any requested import; preserve the supplied student identifiers.
- Do not invent missing names, photos, enrollment details, or parent contact numbers. Flag ambiguous fields for clarification.
- Synthetic fixtures are permitted only in isolated automated tests (mocks or in-memory PGlite). Tests must never connect to the hosted project or insert fixture records there.
- Keep student spreadsheets, extracted photos, and personal data out of Git.
