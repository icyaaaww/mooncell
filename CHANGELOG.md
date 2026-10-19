# Changelog

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
