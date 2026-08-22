# /chill:visualize

Open the realtime Farm State Map for the current Chill workflow.

## Usage

```bash
npm run visualize
```

Then open the printed local URL.

## Data Sources

The visualizer reads:

- `.chill/state/workflow-state.json`
- `.chill/state/audit-log.jsonl`
- `.chill/state/approvals.json`
- `.chill/state/interrupt.json`
- `specs/*/tasks.md` for the active task text

If `workflow-state.json` does not exist, the page uses `.chill/state/workflow-state.example.json` as demo mode.

## Farm State Map

The page renders the standard Chill state path as a pixel farm:

```text
Intake -> ProjectScan -> SpecBuild -> Plan -> Execute -> Review -> QA -> Persist -> ContextReset -> Finish
```

- Completed stages grow mature crops.
- The active stage glows and grows.
- Waiting, failed, and interrupted states use signposts and repair states.
- Frontend execution shows an original pixel craftsperson working in the active plot.

## Rules

- The visualizer is local-only.
- Source of truth remains `.chill/state/`, `.chill/context/`, and `specs/`.
- Do not edit workflow state from the visualizer.
