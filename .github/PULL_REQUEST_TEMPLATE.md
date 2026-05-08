## Summary

<!-- What does this PR do? One paragraph. Link the issue it closes if applicable. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation
- [ ] CI / tooling

## Testing

<!-- How did you verify this? Which tests cover it? -->

- [ ] `cargo test --workspace` passes
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes
- [ ] New/changed routes have rows in `tests/authz_matrix.rs`
- [ ] Migrations are up-only (no `down` file)
- [ ] `EncryptedField<T>` used for any new secret columns
- [ ] `audit_log` row written in every state-changing handler

## Screenshots / recordings

<!-- For UI changes, include before/after screenshots or a screen recording. -->

## Breaking changes

<!-- Does this change any public API, config keys, or migration behaviour? -->
