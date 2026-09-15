# Maestri Flow Implementation Plan

**Current plan:** hybrid Maestro provisioning + deterministic runtime.

Read and execute these parts in order:

1. `docs/superpowers/plans/v2-parts/part-00a.md`
2. `docs/superpowers/plans/v2-parts/part-00b.md`
3. `docs/superpowers/plans/v2-parts/part-01.md`
4. `docs/superpowers/plans/v2-parts/part-02.md`
5. `docs/superpowers/plans/v2-parts/part-03.md`

**Spec:** `docs/superpowers/specs/2026-09-15-maestri-flow-design.md`

The previous plan parts under `docs/superpowers/plans/parts/` are superseded and must not be used for new implementation work.

Key implementation boundary: Maestro may provision and organize the team, but no LLM may choose the next workflow node during a managed run. The runtime owns continuation, retries, regression, joins, queue draining and completion.
