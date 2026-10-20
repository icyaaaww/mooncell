# Changelog

## Unreleased — workbench maintenance

- Keep the active worksheet, selected finding and evidence panel aligned when importing or switching multi-sheet workbooks.
- Paginate the entire review queue in groups of 50, including findings beyond the previous 200-item display limit; reset the page when filtering.
- Validate XLSX shared string/formula indices as explicit decimal integers, normalize leading zeroes and reject invalid shared formula master ranges instead of silently importing incorrect content.
- Add CLI `--fail-on-findings` for automation (exit 2 with full JSON), strict argument validation, help text and consistent workbook metadata checks.
- Include actually computed candidate impacts, calculation failures and coverage limitations in HTML/JSON reports. Discard preview results when replacing or restoring a workbook, and label uncomputed candidates explicitly.

## Core package 0.1.0 — 2026-10-20

Published the first Mooncakes package, corresponding to the standalone application v1.0.0. The registry publishing tool currently requires a 0.x package version. Application and core package versions are therefore tracked separately. Only the MoonBit core, tests, license and package README are distributed on Mooncakes; application download assets remain on GitHub. Installation into an independent consumer and two API tests passed on both JS and Wasm-GC.

## 1.0.0 — 2026-10-19

First stable workbench release. The anomaly rules remain a conservative heuristic; this release is not a claim of full Excel compatibility or measured real-world accuracy.

- Detect numeric constants inside four agreeing peer formulas, with evidence and a reviewable candidate. A prior workbook distinguishes confirmed formula replacement from a structural suspicion.
- Extend bounded numerical preview with comparisons, lazy IF, ABS and ROUND; reject non-finite intermediate values.
- Save full imported inputs, baseline, review states and notes in a checksummed session. Restore only after reanalysis and matching evidence. Checksums detect corruption, not authenticity.
- Export an escaped, standalone HTML report for reading/printing; retain machine-readable JSON reports.
- Run imports and analysis in a local Worker with cancellation and a 30-second timeout. Preserve the workspace on failed import or restoration.
- Add address navigation, review filters, note search and explicit list display limits.
- Resolve XLSX workbook/shared-string parts through package relationships; support BOM-marked UTF-16 XML; reject duplicate relationship IDs and unknown cell types.
- Pin the CI toolchain and provide reproducible packaging with SHA-256 asset checksums.

## 0.1.0 — 2026-10-19

Initial technical preview: MoonBit formula fingerprints, isolated-neighbour anomaly candidates, exact-address version comparison, bounded numerical impact preview, local XLSX/JSON workbench, review export and CLI. Synthetic fixtures, independent numeric references and regression/browser tests. No real-user effectiveness claims or public release yet.
