# /chill:init

Initialize Chill Workflow for a project.

## Usage

```text
/chill-ai start {prdPath} {projectPath}
/chill:init {projectPath}
```

## Workflow

1. Resolve `projectPath`.
2. Read project manifests such as `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `pnpm-workspace.yaml`, and framework config files.
3. Scan key directories: `src/`, `app/`, `packages/`, `frontend/`, `backend/`, `tests/`, `migrations/`, `contracts/`.
4. Detect install, dev, build, test, lint, and typecheck commands.
5. Detect project rules from README, existing agent files, CI, linter config, and test config.
6. Copy or validate `.chill/CHILL.md`, `.chill/skills-map.md`, and the fixed `.chill/diagrams/*.mmd` workflow maps.

## Output

- Project profile.
- Detected commands.
- Relevant subagent list.
- Standard Mermaid workflow maps.

## Stop Conditions

- Project path does not exist.
- Multiple plausible project roots exist and the intended one is unclear.
- Existing `.chill/` contains user changes that would be overwritten.
- No app stack exists and scaffolding would require a technology choice. Use `stack-choice-001` with three recommended options plus custom input.

## Continuation

After initialization, continue to the next internal stage when safe. If user input is needed, offer `/chill-ai start`, `/chill-ai status`, `/chill-ai doctor`, or pause.
