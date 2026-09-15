# Maestri Flow — Design

**Current architecture:** hybrid Maestro provisioning + deterministic Maestri Flow runtime.

This file is the canonical entry point. Read the current design in order:

1. `docs/superpowers/specs/parts/v2-part-00.md`
2. `docs/superpowers/specs/parts/v2-part-01.md`
3. `docs/superpowers/specs/parts/v2-part-02.md`

The previous design is superseded.

Core rule:

> **Maestro may provision. Canvas defines what exists. The user defines what it means and how it flows. The runtime alone enforces the configured workflow.**

Maestro remains available for natural-language team creation, roles, connections, context organization and work decomposition. Once a managed run starts, workflow continuation belongs only to the deterministic runtime until the run is paused or completed.
