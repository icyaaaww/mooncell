///|
pub fn validate(cells : Array[Cell]) -> Unit raise FormulaError {
  if cells.length() > 20000 {
    fail("最多分析 20000 个非空单元格")
  }
  let seen : Map[String, Bool] = Map([])
  let sheets : Map[String, String] = Map([])
  let mut count = 0
  for c in cells {
    if c.sheet == "" || c.sheet.length() > 128 || c.sheet.contains("\u0000") {
      fail("工作表名称无效")
    }
    match sheets.get(c.sheet.to_lower()) {
      Some(s) => if s != c.sheet { fail("工作表名大小写冲突") }
      None => sheets[c.sheet.to_lower()] = c.sheet
    }
    match address_ref(c.address) {
      Some(r) =>
        if r.abs_col || r.abs_row || ref_address(r) != c.address.to_upper() {
          fail(
            "单元格地址必须为标准 A1 格式，不能含 $ 或前导零",
          )
        }
      None => fail("无效单元格地址：" + c.address)
    }
    let id = key(c.sheet, c.address)
    if seen.contains(id) {
      fail("重复单元格：" + c.address)
    }
    seen[id] = true
    if c.formula != "" {
      count += 1
    }
    if c.formula.length() > 4096 || c.value.length() > 32768 {
      fail("单元格内容超过上限")
    }
    if !["number", "text", "boolean", "error", "blank", "unsupported"].contains(
        c.kind,
      ) {
      fail("未知单元格类型")
    }
  }
  if count > 2000 {
    fail("首版最多分析 2000 个公式")
  }
}

///|
fn issue(
  c : Cell,
  rule : String,
  message : String,
  candidate : String,
  evidence : Array[String],
) -> Finding {
  {
    sheet: c.sheet,
    address: c.address.to_upper(),
    rule,
    message,
    formula: c.formula,
    candidate,
    evidence,
  }
}

///|
pub fn audit(cells : Array[Cell]) -> Audit raise FormulaError {
  validate(cells)
  let signatures : Map[String, String] = Map([])
  let map : Map[String, Cell] = Map([])
  let skipped : Array[Finding] = []
  let findings : Array[Finding] = []
  let mut formulas = 0
  for c in cells {
    map[key(c.sheet, c.address)] = c
    if c.formula == "" {
      continue
    }
    formulas += 1
    if c.kind == "unsupported" {
      skipped.push(
        issue(
          c,
          "unsupported",
          "文件适配器标记为不支持的公式类型",
          "",
          [],
        ),
      )
      continue
    }
    try {
      signatures[key(c.sheet, c.address)] = fingerprint(c.formula, c.address)
    } catch {
      FormulaError(message) =>
        skipped.push(issue(c, "unsupported", message, "", []))
    }
  }
  // Only isolated interior anomalies with two agreeing neighbours on each side.
  // A block boundary, subtotal or deliberate exception is not automatically wrong.
  for c in cells {
    let own = match signatures.get(key(c.sheet, c.address)) {
      Some(s) => s
      None => continue
    }
    let anchor = address_ref(c.address).unwrap()
    for horizontal in [false, true] {
      let neighbours : Array[Cell] = []
      let sigs : Array[String] = []
      for offset in [-2, -1, 1, 2] {
        let row = anchor.row + (if horizontal { 0 } else { offset })
        let col = anchor.col + (if horizontal { offset } else { 0 })
        if row < 1 || col < 1 {
          continue
        }
        let id = key(c.sheet, col_name(col) + row.to_string())
        match (map.get(id), signatures.get(id)) {
          (Some(n), Some(s)) => {
            neighbours.push(n)
            sigs.push(s)
          }
          _ => ()
        }
      }
      if sigs.length() != 4 ||
        sigs[0] != sigs[1] ||
        sigs[0] != sigs[2] ||
        sigs[0] != sigs[3] ||
        own == sigs[0] {
        continue
      }
      let candidate = translate(
        neighbours[0].formula,
        neighbours[0].address,
        c.address,
      ) catch {
        _ => continue
      }
      let evidence = neighbours.map(n => n.address + "  " + n.formula)
      findings.push(
        issue(
          c, "pattern_outlier", "前后各两个相邻公式结构一致，本格不同；请确认是否为业务例外。",
          candidate, evidence,
        ),
      )
      break
    }
  }
  { findings, skipped, formulas, analyzed: signatures.length(), }
}

///|
pub fn compare(
  before : Array[Cell],
  after : Array[Cell],
) -> Array[Finding] raise FormulaError {
  validate(before)
  validate(after)
  let old : Map[String, Cell] = Map([])
  let current : Map[String, Cell] = Map([])
  for c in before {
    old[key(c.sheet, c.address)] = c
  }
  for c in after {
    current[key(c.sheet, c.address)] = c
  }
  let result : Array[Finding] = []
  for c in before {
    if c.formula == "" {
      continue
    }
    let next = match current.get(key(c.sheet, c.address)) {
      Some(n) => n
      None => {
        result.push(
          issue(
            c,
            "formula_removed",
            "此地址的公式单元格已删除或变为空白。",
            "",
            ["旧公式：" + c.formula],
          ),
        )
        continue
      }
    }
    if next.formula == "" {
      result.push(
        issue(
          next,
          "formula_replaced",
          "同一地址的公式变成了常量或空白，请核对是否为有意修改。",
          "",
          ["旧公式：" + c.formula, "新值：" + next.value],
        ),
      )
    } else if c.formula != next.formula {
      let same = try
        fingerprint(c.formula, c.address) ==
        fingerprint(next.formula, next.address)
      catch {
        _ => false
      }
      if !same {
        result.push(
          issue(
            next,
            "formula_changed",
            "同一地址的公式发生变化。此对比不会自动对齐插入、删除或重排的行列。",
            "",
            ["旧公式：" + c.formula, "新公式：" + next.formula],
          ),
        )
      }
    }
  }
  for c in after {
    if c.formula == "" {
      continue
    }
    match old.get(key(c.sheet, c.address)) {
      Some(o) =>
        if o.formula == "" {
          result.push(
            issue(c, "formula_added", "此地址新增了公式。", "", [
              "旧值：" + o.value,
            ]),
          )
        }
      None =>
        result.push(
          issue(c, "formula_added", "此地址新增了公式。", "", []),
        )
    }
  }
  result
}

///|
pub struct Impact {
  sheet : String
  address : String
  before : Double?
  after : Double?
  error : String
} derive(ToJson)

///|
pub struct Preview {
  impacts : Array[Impact]
  candidate : String
  inspected : Int32
  unresolved_formulas : Int32
} derive(ToJson)

///|
fn ref_hits(
  r : Reference,
  sheet : String,
  target_sheet : String,
  target : Reference,
) -> Bool {
  qualified_sheet(r, sheet).to_lower() == target_sheet.to_lower() &&
  r.row == target.row &&
  r.col == target.col
}

///|
fn references(
  expr : Expr,
  sheet : String,
  target_sheet : String,
  target : Reference,
) -> Bool {
  match expr {
    CellRef(r) => ref_hits(r, sheet, target_sheet, target)
    Range(a, b) =>
      qualified_sheet(a, sheet).to_lower() == target_sheet.to_lower() &&
      target.row >= Int32::min(a.row, b.row) &&
      target.row <= Int32::max(a.row, b.row) &&
      target.col >= Int32::min(a.col, b.col) &&
      target.col <= Int32::max(a.col, b.col)
    Unary(_, x) => references(x, sheet, target_sheet, target)
    Binary(_, x, y) =>
      references(x, sheet, target_sheet, target) ||
      references(y, sheet, target_sheet, target)
    Call(_, args) => args.any(x => references(x, sheet, target_sheet, target))
    _ => false
  }
}

///|
pub fn preview(
  cells : Array[Cell],
  sheet : String,
  address : String,
  candidate : String,
) -> Preview raise FormulaError {
  let report = audit(cells)
  if !report.findings.any(f => {
      f.sheet == sheet &&
      f.address == address.to_upper() &&
      f.candidate == candidate &&
      candidate != ""
    }) {
    fail("候选已失效或不是本次诊断的候选")
  }
  let changed = cells.map(c => {
    if key(c.sheet, c.address) == key(sheet, address) {
      { ..c, formula: candidate, }
    } else {
      c
    }
  })
  let affected : Map[String, Bool] = Map([])
  affected[key(sheet, address)] = true
  let queue : Array[(String, String)] = [(sheet, address)]
  let parsed : Array[(Cell, Expr)] = []
  for c in cells {
    if c.formula != "" {
      parsed.push((c, parse_tokens(tokenize(c.formula)))) catch {
        _ => ()
      }
    }
  }
  let mut cursor = 0
  let mut work = 0
  while cursor < queue.length() {
    let (s, a) = queue[cursor]
    cursor += 1
    let target = address_ref(a).unwrap()
    for (c, expr) in parsed {
      work += 1
      if work > 200000 {
        fail("影响分析超过首版预算")
      }
      let id = key(c.sheet, c.address)
      if !affected.contains(id) && references(expr, c.sheet, s, target) {
        affected[id] = true
        queue.push((c.sheet, c.address))
        if queue.length() > 100 {
          fail("首版最多预览 100 个受影响单元格")
        }
      }
    }
  }
  let impacts : Array[Impact] = []
  // Isolated evaluators keep one unsupported formula from poisoning other results.
  for (s, a) in queue {
    let mut error = ""
    let before = Some(evaluation(cells).cell(s, a)) catch {
      FormulaError(e) => {
        error = e
        None
      }
    }
    let after = Some(evaluation(changed).cell(s, a)) catch {
      FormulaError(e) => {
        error = e
        None
      }
    }
    impacts.push({ sheet: s, address: a.to_upper(), before, after, error, })
  }
  {
    impacts,
    candidate,
    inspected: parsed.length(),
    unresolved_formulas: report.skipped.length(),
  }
}
