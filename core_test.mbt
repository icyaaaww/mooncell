///|
fn c(
  address : String,
  formula : String,
  value~ : String = "",
  kind~ : String = "number",
  sheet~ : String = "Sheet1",
) -> @mooncell.Cell {
  { sheet, address, formula, value, kind, }
}

///|
fn rows(broken : Bool) -> Array[@mooncell.Cell] {
  let cells : Array[@mooncell.Cell] = []
  for row = 1; row <= 7; row = row + 1 {
    let r = row.to_string()
    cells.push(c("A" + r, "", value=r))
    cells.push(c("B" + r, "", value="10"))
    cells.push(
      c(
        "C" + r,
        if broken && row == 4 {
          "=A4*B3"
        } else {
          "=A" + r + "*B" + r
        },
      ),
    )
  }
  cells.push(c("C9", "=SUM(C1:C7)"))
  cells
}

///|
test "relative references share fingerprints" {
  assert_eq(
    @mooncell.fingerprint("=A1*B1", "C1"),
    @mooncell.fingerprint("=A9*B9", "C9"),
  )
  assert_true(
    @mooncell.fingerprint("=A9*B8", "C9") !=
    @mooncell.fingerprint("=A9*B9", "C9"),
  )
}

///|
test "mixed absolute references shift correctly" {
  assert_eq(@mooncell.translate("=$A1+A$2+$B$3", "C1", "E4"), "=$A4+C$2+$B$3")
}

///|
test "quoted sheets escaped quotes and ranges" {
  assert_eq(
    @mooncell.translate("=SUM('A''B'!A1:B2)", "C1", "C2"),
    "=SUM('A''B'!A2:B3)",
  )
  assert_eq(
    @mooncell.fingerprint("='Sheet One'!$A1", "C1"),
    @mooncell.fingerprint("='sheet one'!$A2", "C2"),
  )
}

///|
test "cell-looking function name stays a function" {
  assert_eq(@mooncell.translate("=LOG10(A1)", "B1", "B2"), "=LOG10(A2)")
}

///|
test "literals preserve contents" {
  assert_eq(
    @mooncell.translate("=IF(A1=1,\"A1\",\"a\"\"b\")", "B1", "B2"),
    "=IF(A2=1,\"A1\",\"a\"\"b\")",
  )
}

///|
test "clean workbook no alert and isolated wrong reference has evidence" {
  assert_eq(@mooncell.audit(rows(false)).findings.length(), 0)
  let report = @mooncell.audit(rows(true))
  assert_eq(report.findings.length(), 1)
  assert_eq(report.findings[0].address, "C4")
  assert_eq(report.findings[0].candidate, "=A4*B4")
  assert_eq(report.findings[0].evidence.length(), 4)
}

///|
test "reasonable discount remains a candidate not a certified error" {
  let cells = rows(false).map(x => {
    if x.address == "C4" {
      { ..x, formula: "=A4*B4*0.9", }
    } else {
      x
    }
  })
  assert_eq(@mooncell.audit(cells).findings[0].rule, "pattern_outlier")
}

///|
test "boundaries and small groups are not majority corrected" {
  let cells = rows(false).map(x => {
    if x.address == "C1" {
      { ..x, formula: "=A1*B1*0.9", }
    } else {
      x
    }
  })
  assert_eq(@mooncell.audit(cells).findings.length(), 0)
  assert_eq(
    @mooncell.audit([c("C1", "=A1"), c("C2", "=B2"), c("C3", "=A3")]).findings.length(),
    0,
  )
}

///|
test "horizontal pattern detection" {
  let cells = [
    c("A3", "=A1*A2"),
    c("B3", "=B1*B2"),
    c("C3", "=C1*B2"),
    c("D3", "=D1*D2"),
    c("E3", "=E1*E2"),
  ]
  assert_eq(@mooncell.audit(cells).findings[0].candidate, "=C1*C2")
}

///|
test "malformed and unsupported formulas are visible" {
  let r = @mooncell.audit([
    c("A1", "=A2 B2"),
    c("A2", "=Table1[Price]"),
    c("A3", "=SUM(A1"),
    c("A4", "=NamedRange"),
  ])
  assert_eq(r.skipped.length(), 4)
  assert_eq(r.analyzed, 0)
}

///|
test "comparison detects overwritten removed added changed formulas" {
  let before = [c("A1", "=B1"), c("A2", "=B2"), c("A3", "=B3")]
  let after = [c("A1", "", value="7"), c("A3", "=B4"), c("A4", "=B4")]
  let changes = @mooncell.compare(before, after)
  assert_eq(changes.length(), 4)
  assert_eq(changes[0].rule, "formula_replaced")
  assert_eq(changes[1].rule, "formula_removed")
  assert_eq(changes[2].rule, "formula_changed")
  assert_eq(changes[3].rule, "formula_added")
}

///|
test "cosmetic spacing and function case are not version changes" {
  assert_eq(
    @mooncell.compare([c("A1", "=sum(B1:B2)")], [c("A1", "= SUM( B1:B2 )")]).length(),
    0,
  )
}

///|
test "preview recalculates rather than trusting cached values" {
  let cells = rows(true).map(x => {
    if x.address == "B3" {
      { ..x, value: "20", }
    } else {
      x
    }
  })
  let p = @mooncell.preview(cells, "Sheet1", "C4", "=A4*B4")
  assert_eq(p.impacts.length(), 2)
  assert_eq(p.impacts[0].before, Some(80.0))
  assert_eq(p.impacts[0].after, Some(40.0))
  assert_eq(p.impacts[1].before, Some(350.0))
  assert_eq(p.impacts[1].after, Some(310.0))
}

///|
test "stale candidate rejected" {
  let rejected = try {
    ignore(@mooncell.preview(rows(false), "Sheet1", "C4", "=A4*B4"))
    false
  } catch {
    _ => true
  }
  assert_true(rejected)
}

///|
test "calculation arithmetic and numeric aggregations" {
  let cells = [
    c("A1", "", value="10"),
    c("A2", "", value="20"),
    c("A3", "", value="heading", kind="text"),
    c("B1", "=SUM(A1:A3)+AVERAGE(A1:A2)*2-MIN(A1:A2)+MAX(A1:A2)+COUNT(A1:A3)"),
    c("B2", "=-(A1+2)*50%"),
  ]
  assert_eq(@mooncell.calculate(cells, "Sheet1", "B1"), 72.0)
  assert_eq(@mooncell.calculate(cells, "Sheet1", "B2"), -6.0)
}

///|
test "cross sheet calculation" {
  let cells = [
    c("A1", "", value="3", sheet="Inputs"),
    c("A1", "='Inputs'!A1*2"),
  ]
  assert_eq(@mooncell.calculate(cells, "Sheet1", "A1"), 6.0)
}

///|
test "cycles division by zero and unsupported functions fail explicitly" {
  for
    cells in [
      [c("A1", "=A2"), c("A2", "=A1")],
      [c("A1", "=1/0")],
      [c("A1", "=INDIRECT(\"B2\")")],
      [c("A1", "=SUM('Missing'!B2)")],
    ] {
    assert_true(
      try {
        ignore(@mooncell.calculate(cells, "Sheet1", "A1"))
        false
      } catch {
        _ => true
      },
    )
  }
}

///|
test "duplicate address and address boundary rejected" {
  for
    cells in [
      [c("A1", "=1"), c("a1", "=2")],
      [c("XFE1", "=1")],
      [c("A1048577", "=1")],
    ] {
    assert_true(
      try {
        ignore(@mooncell.audit(cells))
        false
      } catch {
        _ => true
      },
    )
  }
}

///|
test "translation cannot create invalid references" {
  assert_true(
    try {
      ignore(@mooncell.translate("=A1", "B2", "A1"))
      false
    } catch {
      _ => true
    },
  )
}

///|
test "deep nesting rejected before stack overflow" {
  let mut formula = "1"
  for _ in 0..<70 {
    formula = "(" + formula + ")"
  }
  assert_eq(@mooncell.audit([c("A1", formula)]).skipped.length(), 1)
}

///|
test "constant within four agreeing formulas has an explicit candidate" {
  let cells = rows(false).map(x => {
    if x.address == "C4" {
      { ..x, formula: "", value: "35", }
    } else {
      x
    }
  })
  let report = @mooncell.audit(cells)
  assert_eq(report.findings.length(), 1)
  assert_eq(report.findings[0].rule, "constant_gap")
  let p = @mooncell.preview(cells, "Sheet1", "C4", "=A4*B4")
  assert_eq(p.impacts[0].before, Some(35.0))
  assert_eq(p.impacts[0].after, Some(40.0))
}

///|
test "conditional numeric evaluation short circuits the unused branch" {
  assert_eq(
    @mooncell.calculate([c("A1", "=IF(2>1,ABS(-7),1/0)")], "Sheet1", "A1"),
    7.0,
  )
  assert_eq(
    @mooncell.calculate([c("A1", "=IF(2=1,1/0,9)")], "Sheet1", "A1"),
    9.0,
  )
}

///|
test "round numeric subset ties away from zero" {
  assert_eq(
    @mooncell.calculate([c("A1", "=ROUND(1.25,1)")], "Sheet1", "A1"),
    1.3,
  )
  assert_eq(
    @mooncell.calculate([c("A1", "=ROUND(-1.25,1)")], "Sheet1", "A1"),
    -1.3,
  )
  assert_eq(
    @mooncell.calculate([c("A1", "=ROUND(125,-1)")], "Sheet1", "A1"),
    130.0,
  )
  assert_true(
    try {
      ignore(@mooncell.calculate([c("A1", "=ROUND(1,100)")], "Sheet1", "A1"))
      false
    } catch {
      _ => true
    },
  )
}

///|
test "overflow cannot masquerade as a valid comparison or condition" {
  for
    formula in [
      "=IF(1E308*1E308,1,2)", "=(1E308*1E308)>1", "=ROUND(1,1E308*1E308)",
    ] {
    assert_true(
      try {
        ignore(@mooncell.calculate([c("A1", formula)], "Sheet1", "A1"))
        false
      } catch {
        _ => true
      },
    )
  }
}
