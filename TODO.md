# TODO

- [x] Add end-to-end coverage for a simple tool invocation under the unified runtime (per CLI "Next Steps").
- [x] Audit telemetry/logging parity for Agents SDK tool execution and update docs accordingly.
- [ ] Sweep remaining docs for legacy "Gemini CLI" references and align terminology with Ouroboros Code.
- [ ] Expand connector smoke tests to cover multi-turn tool loops when optional AI SDK connectors are installed.
- [x] Restore core unit tests after the Agents SDK rollout by fixing fs mocks for the new config directory logic.
- [ ] Confirm the unified turn error path still reports telemetry (add targeted coverage for `reportError`).
