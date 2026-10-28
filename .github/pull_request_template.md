## Description

<!-- Provide a brief description of what this PR accomplishes and why it is needed. -->

## Type of Change

- [ ] `feat`: New feature or capability
- [ ] `fix`: Bug fix
- [ ] `perf`: Performance optimization
- [ ] `docs`: Documentation updates
- [ ] `refactor`: Code refactoring without behavior change
- [ ] `test`: New or updated tests
- [ ] `chore`: Maintenance or CI adjustments

## Related Issue

<!-- Fixes #(issue) or Closes #(issue) -->

## Architectural Invariants Checklist

- [ ] **Zero Dev/Infra Clutter in UI**: No server hostnames, database slugs, or hex codes exposed in the frontend.
- [ ] **100% Database-Driven**: No static product arrays or synthetic demo receipt seeds in components.
- [ ] **Single-Line Button Constraint**: Buttons, badges, and navigation links include `whitespace-nowrap shrink-0`.
- [ ] **Base-Unit Normalization**: Item sightings strictly map to canonical units (`€/kg`, `€/L`, `€/unit`).
- [ ] **Tabular Numerals**: Numeric prices, percentages, and unit metrics use `tabular-nums`.

## Verification Checklist

- [ ] `npm test` passes (all unit tests green).
- [ ] `npm run typecheck` passes with 0 errors.
- [ ] `npm run lint` passes with 0 errors.
- [ ] `npm run build` succeeds.
- [ ] Docker build succeeds (`docker build -t ticketera:test .`).
