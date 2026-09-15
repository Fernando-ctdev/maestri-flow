# maestri-flow

Deterministic, user-configurable workflows over Maestri Wire.

Requires Node 20+. Install and verify:

```sh
npm install
npm run typecheck
npm run build
npm test
```

Pair with a Maestri Wire host on port 7434. The client requires protocol 1,
`feedSnapshots`, `canvasMirroring` and `terminalStreaming`; credentials live
outside workflow YAML. Actor bindings use canvas `nodeId`; dispatch resolves
the current `TerminalCard.id`. Maestro is an optional provisioning plane and
never owns transitions during a managed run.
