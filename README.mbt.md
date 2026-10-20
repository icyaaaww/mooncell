# MoonCell

MoonBit spreadsheet formula structure analysis, explicit version comparison, and bounded candidate-impact preview. Core package `icyaaaww/mooncell@0.1.0` corresponds to the GitHub standalone application v1.0.0. The core uses a separate 0.x version because the publishing tool currently requires it; this is not a downgrade of the application.

Add the core library to your MoonBit project:

```sh
moon add icyaaaww/mooncell@0.1.0
```

In your package's `moon.pkg`, import `"icyaaaww/mooncell" @mooncell`. The package contains the MoonBit core, tests and this README; download the offline HTML application from the GitHub repository's releases.

```mbt check
///|
test "consistent relative formula structure" {
  let first = @mooncell.fingerprint("=A1*B1", "C1")
  let later = @mooncell.fingerprint("=A7*B7", "C7")
  assert_eq(first, later)
  assert_eq(@mooncell.translate("=$A1+B$2", "C1", "C3"), "=$A3+B$2")
}
```

Construct `Cell` values (`sheet`, `address`, `formula`, `value`, `kind`) and call `audit`. Each finding carries a rule, address, original formula, candidate, and four peer formulas. A candidate is not proof of an error. Valid `kind` values are `number`, `text`, `boolean`, `error`, `blank`, `unsupported`.

`compare(before, after)` compares exact sheet/address identities. Callers must establish positional alignment; no row or column movement matching is performed.

`preview(cells, sheet, address, candidate)` rechecks the candidate against the current audit, follows supported static references and reports numeric results or explicit failures. Unknown formulas may hide additional dependencies. Calculation is deliberately limited to numeric arithmetic, percent, numeric comparisons, SUM/AVERAGE/MIN/MAX/COUNT/IF/ABS/ROUND. ROUND accepts integer digits from -8 to 8 and uses bounded binary floating-point arithmetic. No Excel semantic equivalence is claimed.

Input limits: 20000 cells, 2000 formulas; formula length 4096, 512 tokens, nesting 64. Preview: 100 affected cells, 10000 cells per aggregate range, bounded traversal and evaluation steps.

No filesystem, DOM, network, XLSX decoder, or spreadsheet editor is part of this core library. See the repository README for the local workbench. Apache-2.0.
