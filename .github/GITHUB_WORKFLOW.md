# Development and review priorities

These guidelines apply to GitHub collaboration. Follow the owner's current task,
then the repository's existing AGENTS.md, CLAUDE.md, product boundaries, approved
design references and release gates. This file does not replace those sources.

## Choose the next change

| Priority | Meaning | Required evidence |
| --- | --- | --- |
| P0 | Credential exposure, data loss, security boundary failure, broken production | Reproduction, affected scope, containment and regression check |
| P1 | Broken core user flow, build/CI blocker, unavailable canonical source | Acceptance scenario, reproducible check and recovery path |
| P2 | Approved feature, usability/accessibility improvement, dependency maintenance | User benefit, bounded scope and appropriate verification |
| P3 | Optional polish, experiments, speculative optimization | Expected benefit and a reason it does not delay P0/P1 |

Severity is separate from delivery order: a large feature is not automatically P1.
Use priority:P0 through priority:P3 labels only after triage. Do not call a proposed
implementation, mock-up, agent review or screenshot a verified working product.

## Before implementation

1. Identify the actual source branch, commit and approved product scope. The default
   branch can be a starter branch; a newer or larger branch is not proof of approval.
2. Read the existing project instructions and follow any required start gates.
3. Write a concrete acceptance scenario; use existing dependencies and package scripts.
4. Prefer a small change addressing one confirmed problem. Preserve working behavior,
   original media, design references and immutable project history.

## Branches and pull requests

- Use a task branch such as fix/<issue>, feat/<issue> or chore/<topic>.
- Use a draft PR while implementation, evidence or prerequisites are incomplete.
- State the problem, resulting behavior, exact checks and known limitations.
- Review the diff and resolve discussions before merging. Use squash for an isolated
  feature/fix; preserve merge commits where branch ancestry is needed for integration.
- Do not require a second approval in an owner-only repository unless an independent
  reviewer is actually available. Existing independent-review requirements still apply.
- Retain runtime, release, deployment and evidence branches while anything refers to
  them. Delete only genuinely disposable merged task branches after checking references.
- Do not promote a branch to canonical status by renaming it or merging unchecked code.

## Verification and automation

- A passing check must test the changed behavior. Do not disable tests, loosen assertions
  or regenerate visual goldens from the current implementation merely to turn CI green.
- State what ran locally and in CI, including platform, commit and omitted checks.
- Keep GITHUB_TOKEN read-only by default; grant write permissions only to the job that
  needs them. Workflow bots must not approve their own changes.
- Pin action revisions, bound job duration, and cancel superseded CI work where safe.
  Do not cancel an in-flight release/deployment just because a newer run appears.
- Pass untrusted PR titles, branch names and other event data through environment
  variables or structured arguments, never directly into executable shell source.
- Keep CI independent of production secrets. Review dependency/security update PRs
  and their compatibility checks rather than merging updates automatically.

## Release and deployment

Merge approval and deployment approval are distinct when the task does not authorize
publication. Inspect automatic deployment triggers before changing the default branch
or merging. Deploy the exact verified revision, preserve rollback evidence, and report
completion only after the target environment is healthy. Never include credentials,
private user content or local access tokens in commits, issues or CI logs.
