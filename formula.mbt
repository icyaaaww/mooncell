///|
priv enum Expr {
  Number(Double)
  Literal
  CellRef(Reference)
  Range(Reference, Reference)
  Unary(String, Expr)
  Binary(String, Expr, Expr)
  Call(String, Array[Expr])
}

///|
priv struct Parser {
  tokens : Array[Token]
  mut pos : Int32
  mut depth : Int32
}

///|
fn priority(op : String) -> Int32 {
  match op {
    "=" | "<>" | "<" | ">" | "<=" | ">=" => 1
    "&" => 2
    "+" | "-" => 3
    "*" | "/" => 4
    "^" => 5
    _ => 0
  }
}

///|
fn Parser::take(self : Parser, op : String) -> Bool {
  if self.pos >= self.tokens.length() {
    return false
  }
  match self.tokens[self.pos] {
    Op(actual) =>
      if actual == op {
        self.pos += 1
        true
      } else {
        false
      }
    _ => false
  }
}

///|
fn Parser::expression(
  self : Parser,
  minimum : Int32,
) -> Expr raise FormulaError {
  self.depth += 1
  if self.depth > 64 {
    fail("公式嵌套超过 64 层")
  }
  if self.pos >= self.tokens.length() {
    fail("公式缺少表达式")
  }
  let token = self.tokens[self.pos]
  self.pos += 1
  let mut left : Expr = match token {
    Num(n) =>
      Number(
        @strconv.parse_double(n) catch {
          _ => {
            fail("数字无效")
            0.0
          }
        },
      )
    Text(_) => Literal
    Ref(r) =>
      if self.take(":") {
        if self.pos >= self.tokens.length() {
          fail("范围缺少结束引用")
        }
        let end = self.tokens[self.pos]
        self.pos += 1
        match end {
          Ref(e) => {
            let end_sheet = if e.sheet == "" { r.sheet } else { e.sheet }
            if end_sheet.to_lower() != r.sheet.to_lower() {
              fail("不支持跨工作表的范围端点")
            }
            Range(r, { ..e, sheet: end_sheet, })
          }
          _ => {
            fail("范围结束位置无效")
            CellRef(r)
          }
        }
      } else {
        CellRef(r)
      }
    Name(name) => {
      if name == "INDIRECT" || name == "OFFSET" {
        fail("动态引用尚未分析：" + name)
      }
      if !self.take("(") {
        fail("暂不支持命名范围或常量名称：" + name)
      }
      let args : Array[Expr] = []
      if !self.take(")") {
        args.push(self.expression(1))
        while self.take(",") {
          args.push(self.expression(1))
        }
        if !self.take(")") {
          fail("函数括号未闭合")
        }
      }
      Call(name, args)
    }
    Op("+") => Unary("+", self.expression(6))
    Op("-") => Unary("-", self.expression(6))
    Op("(") => {
      let inner = self.expression(1)
      if !self.take(")") {
        fail("括号未闭合")
      }
      inner
    }
    _ => {
      fail("表达式开头无效")
      Number(0.0)
    }
  }
  while self.take("%") {
    left = Unary("%", left)
  }
  while self.pos < self.tokens.length() {
    let op = match self.tokens[self.pos] {
      Op(op) => op
      _ => break
    }
    let p = priority(op)
    if p < minimum || p == 0 {
      break
    }
    self.pos += 1
    left = Binary(op, left, self.expression(p + 1))
  }
  self.depth -= 1
  left
}

///|
fn parse_tokens(tokens : Array[Token]) -> Expr raise FormulaError {
  let parser = Parser::{ tokens, pos: 0, depth: 0, }
  let expr = parser.expression(1)
  if parser.pos != tokens.length() {
    fail("存在未解析的语法（如交叉引用或隐式交集）")
  }
  expr
}

///|
fn key(sheet : String, address : String) -> String {
  sheet.to_lower() + "\u0000" + address.to_upper()
}

///|
fn ref_address(r : Reference) -> String {
  col_name(r.col) + r.row.to_string()
}

///|
fn qualified_sheet(r : Reference, current : String) -> String {
  if r.sheet == "" {
    current
  } else {
    r.sheet
  }
}

///|
priv struct Evaluation {
  cells : Map[String, Cell]
  cache : Map[String, Double]
  visiting : Map[String, Bool]
  sheets : Map[String, Bool]
  mut steps : Int32
  mut depth : Int32
}

///|
fn evaluation(cells : Array[Cell]) -> Evaluation {
  let map : Map[String, Cell] = Map([])
  let sheets : Map[String, Bool] = Map([])
  for c in cells {
    map[key(c.sheet, c.address)] = c
    sheets[c.sheet.to_lower()] = true
  }
  { cells: map, cache: Map([]), visiting: Map([]), sheets, steps: 0, depth: 0, }
}

///|
fn Evaluation::cell(
  self : Evaluation,
  sheet : String,
  address : String,
) -> Double raise FormulaError {
  self.steps += 1
  if self.steps > 100000 || self.depth > 100 {
    fail("重算预算耗尽")
  }
  if !self.sheets.contains(sheet.to_lower()) {
    fail("引用的工作表不存在：" + sheet)
  }
  let id = key(sheet, address)
  match self.cache.get(id) {
    Some(v) => return v
    None => ()
  }
  if self.visiting.get(id).unwrap_or(false) {
    fail("存在循环引用")
  }
  let c = match self.cells.get(id) {
    Some(c) => c
    None => return 0.0
  }
  if c.kind == "unsupported" || (c.kind == "error" && c.formula == "") {
    fail("依赖单元格包含不支持的内容或错误：" + address)
  }
  self.visiting[id] = true
  self.depth += 1
  let value = if c.formula != "" {
    self.expr(parse_tokens(tokenize(c.formula)), sheet)
  } else if c.value == "" {
    0.0
  } else if c.kind != "number" {
    fail("暂不重算涉及非数值输入的公式：" + address)
    0.0
  } else {
    @strconv.parse_double(c.value) catch {
      _ => {
        fail("数值无效")
        0.0
      }
    }
  }
  self.depth -= 1
  self.visiting[id] = false
  if value.is_nan() || value.is_inf() {
    fail("计算结果不是有限数值")
  }
  self.cache[id] = value
  value
}

///|
fn Evaluation::expr(
  self : Evaluation,
  expr : Expr,
  sheet : String,
) -> Double raise FormulaError {
  self.steps += 1
  if self.steps > 100000 {
    fail("重算预算耗尽")
  }
  match expr {
    Number(n) => n
    Literal => {
      fail("暂不支持文本运算")
      0.0
    }
    CellRef(r) => self.cell(qualified_sheet(r, sheet), ref_address(r))
    Range(_, _) => {
      fail("范围必须用于聚合函数")
      0.0
    }
    Unary(op, x) => {
      let v = self.expr(x, sheet)
      if op == "-" {
        -v
      } else if op == "%" {
        v / 100.0
      } else {
        v
      }
    }
    Binary(op, x, y) => {
      let a = self.expr(x, sheet)
      let b = self.expr(y, sheet)
      match op {
        "+" => a + b
        "-" => a - b
        "*" => a * b
        "/" =>
          if b == 0.0 {
            fail("除数为零")
            0.0
          } else {
            a / b
          }
        _ => {
          fail("预览暂不支持运算符：" + op)
          0.0
        }
      }
    }
    Call(name, args) => {
      if !["SUM", "AVERAGE", "MIN", "MAX", "COUNT"].contains(name) {
        fail("预览暂不支持函数：" + name)
      }
      let values : Array[Double] = []
      for arg in args {
        match arg {
          Range(a, b) => {
            let target = qualified_sheet(a, sheet)
            if !self.sheets.contains(target.to_lower()) {
              fail("引用工作表不存在")
            }
            let r0 = Int32::min(a.row, b.row)
            let r1 = Int32::max(a.row, b.row)
            let c0 = Int32::min(a.col, b.col)
            let c1 = Int32::max(a.col, b.col)
            if r1 - r0 > 10000 ||
              c1 - c0 > 10000 ||
              (r1 - r0 + 1) * (c1 - c0 + 1) > 10000 {
              fail("预览范围超过 10000 格")
            }
            for row = r0; row <= r1; row = row + 1 {
              for col = c0; col <= c1; col = col + 1 {
                let address = col_name(col) + row.to_string()
                match self.cells.get(key(target, address)) {
                  Some(c) =>
                    if c.formula != "" ||
                      c.kind == "number" ||
                      c.kind == "error" ||
                      c.kind == "unsupported" {
                      values.push(self.cell(target, address))
                    }
                  None => ()
                }
              }
            }
          }
          CellRef(r) => {
            let target = qualified_sheet(r, sheet)
            if !self.sheets.contains(target.to_lower()) {
              fail("引用工作表不存在")
            }
            match self.cells.get(key(target, ref_address(r))) {
              Some(c) =>
                if c.formula != "" ||
                  c.kind == "number" ||
                  c.kind == "error" ||
                  c.kind == "unsupported" {
                  values.push(self.cell(target, ref_address(r)))
                }
              None => ()
            }
          }
          _ => values.push(self.expr(arg, sheet))
        }
      }
      if name == "COUNT" {
        return values.length().to_double()
      }
      if values.is_empty() {
        if name == "AVERAGE" {
          fail("AVERAGE 没有数值输入")
        }
        return 0.0
      }
      let mut result = if name == "MIN" || name == "MAX" {
        values[0]
      } else {
        0.0
      }
      for v in values {
        if name == "MIN" {
          result = Double::min(result, v)
        } else if name == "MAX" {
          result = Double::max(result, v)
        } else {
          result += v
        }
      }
      if name == "AVERAGE" {
        result / values.length().to_double()
      } else {
        result
      }
    }
  }
}

///|
pub fn calculate(
  cells : Array[Cell],
  sheet : String,
  address : String,
) -> Double raise FormulaError {
  validate(cells)
  evaluation(cells).cell(sheet, address)
}
