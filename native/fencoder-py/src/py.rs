use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyBytes;
use serde_json::{Value, json};

use crate::execute::Execute;
use crate::preview::PreviewJob;
use crate::{commands, engine, ffmpeg, formats, presets};

fn parse(params: &str) -> PyResult<Value> {
    let t = params.trim();
    if t.is_empty() {
        return Ok(Value::Object(Default::default()));
    }
    serde_json::from_str(t).map_err(|e| PyValueError::new_err(format!("params are not JSON: {e}")))
}

fn err(e: String) -> PyErr {
    PyValueError::new_err(e)
}

#[pyclass(unsendable, module = "fe_core")]
pub struct Engine {
    e: engine::Engine,
}

#[pymethods]
impl Engine {
    #[new]
    fn new() -> Self {
        Engine { e: engine::Engine::new() }
    }

    #[pyo3(signature = (id, params, source = "agent"))]
    fn execute(&mut self, id: &str, params: &str, source: &str) -> PyResult<String> {
        let p = parse(params)?;
        self.e.execute(id, p, source).map(|v| v.to_string()).map_err(err)
    }

    #[pyo3(signature = (steps, label = None, atomic = true, source = "agent"))]
    fn batch(&mut self, steps: &str, label: Option<&str>, atomic: bool, source: &str) -> PyResult<String> {
        let list = parse(steps)?;
        let arr = list.as_array().ok_or_else(|| PyValueError::new_err("steps is a JSON array of {command, params}"))?;
        self.e.batch(arr, label, atomic, source).map(|v| v.to_string()).map_err(err)
    }

    fn is_command(&self, id: &str) -> bool {
        commands::get(id).is_ok()
    }

    fn command_is_query(&self, id: &str) -> bool {
        commands::get(id).map(|c| c.query).unwrap_or(false)
    }

    #[pyo3(signature = (filter = None, schemas = false))]
    fn command_list(&self, filter: Option<&str>, schemas: bool) -> String {
        Value::Array(commands::listing(filter, schemas)).to_string()
    }

    fn describe(&self, id: &str) -> PyResult<String> {
        commands::get(id).map(|c| c.row(true).to_string()).map_err(err)
    }

    fn menus(&self) -> String {
        commands::menus().to_string()
    }

    fn revision(&self) -> u64 {
        self.e.revision
    }

    fn running(&self) -> bool {
        self.e.running
    }

    fn ui_state(&self) -> String {
        self.e.ui_state().to_string()
    }

    fn tick(&mut self, now: f64) -> String {
        self.e.tick(now).to_string()
    }

    fn drain_events(&mut self) -> String {
        Value::Array(self.e.drain_events()).to_string()
    }

    fn save(&mut self) {
        self.e.save();
    }

    fn shutdown(&mut self) {
        self.e.shutdown();
    }

    fn preview_job(&self, params: &str) -> PyResult<PyPreviewJob> {
        let job = PreviewJob::from_params(&self.e, &parse(params)?).map_err(err)?;
        Ok(PyPreviewJob { job })
    }
}

#[pyclass(module = "fe_core", name = "PreviewJob")]
pub struct PyPreviewJob {
    job: PreviewJob,
}

#[pymethods]
impl PyPreviewJob {
    fn run<'py>(&self, py: Python<'py>) -> PyResult<(Bound<'py, PyBytes>, String)> {
        let job = &self.job;
        let (png, meta) = py.detach(|| job.run()).map_err(err)?;
        Ok((PyBytes::new(py, &png), meta.to_string()))
    }
}

#[pyfunction]
#[pyo3(signature = (path, frame_rate = None))]
fn probe(py: Python<'_>, path: &str, frame_rate: Option<f64>) -> String {
    py.detach(|| ffmpeg::probe(path, frame_rate)).to_string()
}

#[pyfunction]
#[pyo3(signature = (path, at = 0.0, width = 320, frame_rate = None))]
fn thumbnail<'py>(py: Python<'py>, path: &str, at: f64, width: u32, frame_rate: Option<f64>) -> Option<Bound<'py, PyBytes>> {
    let data = py.detach(|| ffmpeg::thumbnail(path, at, width, frame_rate))?;
    Some(PyBytes::new(py, &data))
}

#[pyfunction]
fn ffmpeg_info(py: Python<'_>) -> String {
    py.detach(|| {
        let (origin, dir) = ffmpeg::origin();
        json!({"ffmpeg": ffmpeg::ffmpeg(), "ffprobe": ffmpeg::ffprobe(), "origin": origin, "dir": dir, "version": ffmpeg::version()})
    })
    .to_string()
}

#[pyfunction]
fn catalogue() -> String {
    json!({"formats": formats::ids(), "presets": presets::listing(None, None, None).len()}).to_string()
}

#[pyfunction]
fn version() -> String {
    json!({"core": env!("CARGO_PKG_VERSION"), "engine": "fe"}).to_string()
}

#[pymodule]
fn fe_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<Engine>()?;
    m.add_class::<PyPreviewJob>()?;
    m.add_function(wrap_pyfunction!(probe, m)?)?;
    m.add_function(wrap_pyfunction!(thumbnail, m)?)?;
    m.add_function(wrap_pyfunction!(ffmpeg_info, m)?)?;
    m.add_function(wrap_pyfunction!(catalogue, m)?)?;
    m.add_function(wrap_pyfunction!(version, m)?)?;
    m.add("__version__", env!("CARGO_PKG_VERSION"))?;
    Ok(())
}
