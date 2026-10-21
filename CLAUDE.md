# CLAUDE.md

Rules for Claude Code in this repository. The development plan and project decisions are in
[docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Code

- No comments in source code. Names of variables, functions, classes and files must explain the code on their own;
  if a piece of code needs a comment to be understood, rename or restructure it instead.
- The only exception is machine-readable directives that tools require (a shebang, `// @ts-expect-error`, a lint
  suppression); keep them rare.
- Tool descriptions and schema `.describe()` texts are not comments: they are the interface the model reads, so they
  stay and get the same care as code.
- Follow established best practices. Use TDD, OOP and SOLID where they are logical and appropriate; small pure
  helpers can stay plain functions.
- TDD: write a failing test first, then the minimal code that makes it pass, then refactor. Spike code is throwaway
  and is rewritten test-first before it ships.
- TypeScript in strict mode; GDScript with static typing everywhere.

## Commits and pull requests

- Never mention Claude or any other AI assistant in commits: no `Co-Authored-By: Claude …` trailers, no
  "Generated with Claude Code" lines, no AI attribution anywhere in the commit message.
- The same applies to pull request titles and descriptions.

## Language

- Everything in the repository is written in English: code, tool descriptions, README, `docs/`.
- Chat with the user in Russian.
