///|
pub(all) struct Cell {
  sheet : String
  address : String
  formula : String
  value : String
  kind : String
} derive(ToJson, FromJson)

///|
pub struct Finding {
  sheet : String
  address : String
  rule : String
  message : String
  formula : String
  candidate : String
  evidence : Array[String]
} derive(ToJson, FromJson)

///|
pub struct Audit {
  findings : Array[Finding]
  skipped : Array[Finding]
  formulas : Int32
  analyzed : Int32
} derive(ToJson)

///|
priv struct Reference {
  sheet : String
  row : Int32
  col : Int32
  abs_row : Bool
  abs_col : Bool
}

///|
priv enum Token {
  Ref(Reference)
  Num(String)
  Text(String)
  Name(String)
  Op(String)
}

///|
pub suberror FormulaError {
  FormulaError(String)
}

///|
fn fail(message : String) -> Unit raise FormulaError {
  raise FormulaError(message)
}

///|
fn letter(c : Char) -> Bool {
  (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
}

///|
fn digit(c : Char) -> Bool {
  c >= '0' && c <= '9'
}

///|
fn name_char(c : Char) -> Bool {
  letter(c) || digit(c) || c == '_' || c == '.' || c.to_int() > 127
}

///|
fn slice(chars : Array[Char], start : Int32, end : Int32) -> String {
  String::from_array(chars[start:end])
}

///|
fn address_ref(text : String) -> Reference? {
  let a = text.to_upper().to_array()
  let mut i = 0
  let ac = i < a.length() && a[i] == '$'
  if ac {
    i += 1
  }
  let begin = i
  let mut col = 0
  while i < a.length() && letter(a[i]) {
    if i - begin >= 3 {
      return None
    }
    col = col * 26 + a[i].to_int() - 64
    i += 1
  }
  if begin == i || col > 16384 {
    return None
  }
  let ar = i < a.length() && a[i] == '$'
  if ar {
    i += 1
  }
  let begin = i
  let mut row = 0
  while i < a.length() && digit(a[i]) {
    if i - begin >= 7 {
      return None
    }
    row = row * 10 + a[i].to_int() - 48
    i += 1
  }
  if begin == i || i != a.length() || row < 1 || row > 1048576 {
    return None
  }
  Some({ sheet: "", row, col, abs_row: ar, abs_col: ac, })
}

///|
fn col_name(col : Int32) -> String {
  let mut n = col
  let mut result = ""
  let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".to_array()
  while n > 0 {
    result = letters[(n - 1) % 26].to_string() + result
    n = (n - 1) / 26
  }
  result
}

///|
fn ref_text(r : Reference) -> String {
  let prefix = if r.sheet == "" {
    ""
  } else {
    "'" + r.sheet.replace_all(old="'", new="''") + "'!"
  }
  prefix +
  (if r.abs_col { "$" } else { "" }) +
  col_name(r.col) +
  (if r.abs_row { "$" } else { "" }) +
  r.row.to_string()
}

///|
fn token_text(t : Token) -> String {
  match t {
    Ref(r) => ref_text(r)
    Num(s) | Text(s) | Name(s) | Op(s) => s
  }
}

///|
fn tokenize(formula : String) -> Array[Token] raise FormulaError {
  if formula.length() > 4096 {
    fail("公式超过 4096 字符")
  }
  let a = formula.trim().to_owned().to_array()
  let mut i = if a.length() > 0 && a[0] == '=' { 1 } else { 0 }
  let out : Array[Token] = []
  while i < a.length() {
    if a[i] == ' ' || a[i] == '\t' || a[i] == '\n' || a[i] == '\r' {
      i += 1
      continue
    }
    let start = i
    if a[i] == '"' {
      i += 1
      let mut closed = false
      while i < a.length() {
        if a[i] == '"' {
          i += 1
          if i < a.length() && a[i] == '"' {
            i += 1
          } else {
            closed = true
            break
          }
        } else {
          i += 1
        }
      }
      if !closed {
        fail("字符串未闭合")
      }
      out.push(Text(slice(a, start, i)))
    } else if a[i] == '\'' ||
      letter(a[i]) ||
      a[i] == '$' ||
      a[i] == '_' ||
      a[i].to_int() > 127 {
      let mut sheet = ""
      if a[i] == '\'' {
        i += 1
        let mut closed = false
        while i < a.length() {
          if a[i] == '\'' {
            i += 1
            if i < a.length() && a[i] == '\'' {
              sheet += "'"
              i += 1
            } else {
              closed = true
              break
            }
          } else {
            sheet += a[i].to_string()
            i += 1
          }
        }
        if !closed || i >= a.length() || a[i] != '!' {
          fail("工作表引用无效")
        }
        i += 1
      } else {
        while i < a.length() && (name_char(a[i]) || a[i] == '$') {
          i += 1
        }
        if i < a.length() && a[i] == '!' {
          sheet = slice(a, start, i)
          i += 1
        } else {
          let word = slice(a, start, i).to_upper()
          let mut next = i
          while next < a.length() && a[next] == ' ' {
            next += 1
          }
          if next < a.length() && a[next] == '(' {
            out.push(Name(word))
          } else {
            match address_ref(word) {
              Some(r) => out.push(Ref(r))
              None => out.push(Name(word))
            }
          }
          continue
        }
      }
      if sheet.contains("[") || sheet.contains("]") || sheet.contains(":") {
        fail("暂不支持外部工作簿或三维引用")
      }
      let start = i
      while i < a.length() && (letter(a[i]) || digit(a[i]) || a[i] == '$') {
        i += 1
      }
      match address_ref(slice(a, start, i)) {
        Some(r) => out.push(Ref({ ..r, sheet, }))
        None => fail("暂不支持此工作表引用")
      }
    } else if digit(a[i]) || a[i] == '.' {
      while i < a.length() && (digit(a[i]) || a[i] == '.') {
        i += 1
      }
      if i < a.length() && (a[i] == 'e' || a[i] == 'E') {
        i += 1
        if i < a.length() && (a[i] == '+' || a[i] == '-') {
          i += 1
        }
        while i < a.length() && digit(a[i]) {
          i += 1
        }
      }
      let n = slice(a, start, i)
      ignore(@strconv.parse_double(n)) catch {
        _ => fail("数字格式无效")
      }
      out.push(Num(n))
    } else {
      let op = a[i].to_string()
      if !["+", "-", "*", "/", "^", "(", ")", ":", ",", "%", "=", "<", ">", "&"].contains(
          op,
        ) {
        fail("暂不支持的公式语法：" + op)
      }
      i += 1
      if i < a.length() &&
        (
          (op == "<" && (a[i] == '>' || a[i] == '=')) ||
          (op == ">" && a[i] == '=')
        ) {
        out.push(Op(op + a[i].to_string()))
        i += 1
      } else {
        out.push(Op(op))
      }
    }
    if out.length() > 512 {
      fail("公式 token 超过上限")
    }
  }
  if out.length() > 512 {
    fail("公式 token 超过上限")
  }
  if out.is_empty() {
    fail("公式为空")
  }
  out
}

///|
pub fn translate(
  formula : String,
  from : String,
  to : String,
) -> String raise FormulaError {
  let source = match address_ref(from) {
    Some(r) => r
    None => {
      fail("源地址无效")
      return ""
    }
  }
  let target = match address_ref(to) {
    Some(r) => r
    None => {
      fail("目标地址无效")
      return ""
    }
  }
  let parts : Array[String] = []
  for token in tokenize(formula) {
    match token {
      Ref(r) => {
        let row = if r.abs_row {
          r.row
        } else {
          r.row + target.row - source.row
        }
        let col = if r.abs_col {
          r.col
        } else {
          r.col + target.col - source.col
        }
        if row < 1 || col < 1 || row > 1048576 || col > 16384 {
          fail("平移后的引用越界")
        }
        parts.push(ref_text({ ..r, row, col, }))
      }
      _ => parts.push(token_text(token))
    }
  }
  "=" + parts.join("")
}

///|
pub fn fingerprint(
  formula : String,
  address : String,
) -> String raise FormulaError {
  let anchor = match address_ref(address) {
    Some(r) => r
    None => {
      fail("单元格地址无效")
      return ""
    }
  }
  let tokens = tokenize(formula)
  ignore(parse_tokens(tokens))
  let parts : Array[String] = []
  for t in tokens {
    match t {
      Ref(r) => {
        let row = if r.abs_row {
          "R$" + r.row.to_string()
        } else {
          "R[" + (r.row - anchor.row).to_string() + "]"
        }
        let col = if r.abs_col {
          "C$" + r.col.to_string()
        } else {
          "C[" + (r.col - anchor.col).to_string() + "]"
        }
        parts.push(r.sheet.to_lower() + "!" + row + col)
      }
      _ => parts.push(token_text(t))
    }
  }
  parts.join("|")
}
