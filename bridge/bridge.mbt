///|
pub fn dispatch(input : String) -> String {
  if input.length() > 8000000 {
    return "{\"ok\":false,\"message\":\"请求过大\"}"
  }
  try {
    let request = @json.parse(input)
    let result : Json = match request {
      { "action": "audit", "cells": cells, .. } =>
        @cell.audit(@json.from_json(cells)).to_json()
      { "action": "compare", "before": before, "after": after, .. } =>
        Json(@cell.compare(@json.from_json(before), @json.from_json(after)))
      {
        "action": "preview",
        "cells": cells,
        "sheet": String(sheet),
        "address": String(address),
        "candidate": String(candidate),
        ..
      } =>
        @cell.preview(@json.from_json(cells), sheet, address, candidate).to_json()
      {
        "action": "translate",
        "formula": String(formula),
        "from": String(from),
        "to": String(to),
        ..
      } => Json(@cell.translate(formula, from, to))
      _ => return "{\"ok\":false,\"message\":\"未知请求\"}"
    }
    ({ "ok": true, "data": result } : Json).stringify()
  } catch {
    @cell.FormulaError(message) =>
      ({ "ok": false, "message": message } : Json).stringify()
    e => ({ "ok": false, "message": e.to_string() } : Json).stringify()
  }
}
