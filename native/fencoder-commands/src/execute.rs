use serde_json::{Value, json};

use crate::commands;
use crate::engine::Engine;
use crate::util::{Res, now};

pub trait Execute {
    fn execute(&mut self, id: &str, params: Value, source: &str) -> Res;
    fn batch(&mut self, steps: &[Value], label: Option<&str>, atomic: bool, source: &str) -> Res;
}

impl Execute for Engine {
    fn execute(&mut self, id: &str, params: Value, source: &str) -> Res {
        let cmd = commands::get(id)?;
        let params = commands::check(cmd, params)?;
        if source == "ui" {
            self.last_interaction = now();
        }
        let result = if cmd.undoable {
            let before = self.doc.clone();
            match (cmd.run)(self, &params) {
                Ok(r) => {
                    if self.doc != before {
                        self.undo.push((cmd.label.to_string(), before));
                        if self.undo.len() > 100 {
                            self.undo.remove(0);
                        }
                        self.redo.clear();
                    }
                    self.changed(true, source);
                    r
                }
                Err(e) => {
                    self.doc = before;
                    if !(cmd.query && source == "ui") {
                        self.note(source, id, false, Some(&e));
                    }
                    return Err(e);
                }
            }
        } else {
            let r = (cmd.run)(self, &params);
            if let Err(e) = &r {
                if !(cmd.query && source == "ui") {
                    let e2 = e.clone();
                    self.note(source, id, false, Some(&e2));
                }
            }
            let r = r?;
            if !cmd.query {
                self.changed(false, source);
            }
            r
        };
        if !(cmd.query && source == "ui") {
            self.note(source, id, true, None);
        }
        Ok(result)
    }

    fn batch(&mut self, steps: &[Value], label: Option<&str>, atomic: bool, source: &str) -> Res {
        let before = self.doc.clone();
        let mut results: Vec<Value> = Vec::new();
        for (n, step) in steps.iter().enumerate() {
            let cid = step["command"].as_str().unwrap_or("");
            let params = resolve_refs(&step["params"], &results);
            let outcome = commands::get(cid).and_then(|c| commands::check(c, if params.is_null() { json!({}) } else { params }).and_then(|p| (c.run)(self, &p)));
            match outcome {
                Ok(v) => results.push(v),
                Err(e) => {
                    if atomic {
                        self.doc = before;
                        self.changed(true, source);
                        return Err(format!("step {} ({cid}) failed: {e}; the batch was undone", n + 1));
                    }
                    results.push(json!({"error": e}));
                }
            }
        }
        if self.doc != before {
            self.undo.push((label.unwrap_or(&format!("Batch of {}", steps.len())).to_string(), before));
            self.redo.clear();
        }
        self.changed(true, source);
        self.note(source, "engine.batch", true, None);
        Ok(json!({"results": results}))
    }
}

fn resolve_refs(v: &Value, results: &[Value]) -> Value {
    match v {
        Value::String(s) if s.starts_with('$') => {
            let rest = &s[1..];
            let (num, path) = match rest.find(['.', '[']) {
                Some(i) => (&rest[..i], &rest[i..]),
                None => (rest, ""),
            };
            let Ok(k) = num.parse::<usize>() else { return v.clone() };
            if k == 0 || k > results.len() {
                return Value::Null;
            }
            let mut node = results[k - 1].clone();
            let re = regex::Regex::new(r"\.([\w-]+)|\[(\d+)\]").unwrap();
            for c in re.captures_iter(path) {
                node = if let Some(key) = c.get(1) { node.get(key.as_str()).cloned().unwrap_or(Value::Null) } else { node.get(c[2].parse::<usize>().unwrap_or(0)).cloned().unwrap_or(Value::Null) };
            }
            node
        }
        Value::Array(a) => Value::Array(a.iter().map(|x| resolve_refs(x, results)).collect()),
        Value::Object(m) => Value::Object(m.iter().map(|(k, x)| (k.clone(), resolve_refs(x, results))).collect()),
        other => other.clone(),
    }
}
