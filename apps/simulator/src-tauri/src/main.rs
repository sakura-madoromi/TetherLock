use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
};
use tauri::{ipc::Channel, Manager, State};
use tetherlock_simulator::{
    network::Connection,
    runtime::{Action, Device, LogEntry, Runtime, Snapshot},
    state::{Mode, SimulatorConfig},
};
use tokio::sync::Mutex;

struct Backend {
    runtime: Mutex<Runtime>,
    subscription: Arc<AtomicU64>,
    root: PathBuf,
    configured: AtomicBool,
    acknowledged: Arc<AtomicU64>,
    closing: AtomicBool,
}
#[derive(serde::Serialize, Clone)]
struct Display {
    subscription: u64,
    snapshot: Snapshot,
    #[serde(skip_serializing_if = "Option::is_none")]
    logs: Option<Vec<LogEntry>>,
}
#[tauri::command]
async fn operate(action: Action, backend: State<'_, Backend>) -> Result<(), String> {
    backend.runtime.lock().await.action(action).await
}
#[tauri::command]
async fn connect(
    mut config: Connection,
    initial_cards: u8,
    backend: State<'_, Backend>,
) -> Result<(), String> {
    config.validate().map_err(|e| e.to_string())?;
    let account = format!(
        "{}@{}:{}:{}",
        config.username.as_deref().unwrap_or(""),
        config.broker_host,
        config.broker_port,
        config.serial
    );
    let supplied = config.password.take();
    let saved = if config.username.is_none() && supplied.is_none() {
        None
    } else {
        tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>, String> {
            let entry = keyring::Entry::new("io.tetherlock.simulator.mqtt", &account)
                .map_err(|e| e.to_string())?;
            if let Some(password) = supplied {
                entry
                    .set_password(&password)
                    .map_err(|e| format!("Secret Service: {e}"))?;
                return Ok(Some(password));
            }
            match entry.get_password() {
                Ok(password) => Ok(Some(password)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(error) => Err(format!("Secret Service: {error}")),
            }
        })
        .await
        .map_err(|e| e.to_string())??
    };
    config.password = saved;
    let mut runtime = backend.runtime.lock().await;
    if !backend.configured.load(Ordering::SeqCst)
        || runtime.snapshots.borrow().state["serial"].as_str() != Some(&config.serial)
    {
        // Acquire and validate the next device before releasing the current one.
        let device = Device::new(SimulatorConfig {
            serial: config.serial.clone(),
            mode: Mode::Simulated,
            initial_cards,
            state_dir: Some(backend.root.join(&config.serial)),
        })
        .map_err(|e| e.to_string())?;
        runtime.shutdown().await;
        *runtime = Runtime::start(device);
        backend.subscription.fetch_add(1, Ordering::SeqCst);
    }
    let mut settings_value = serde_json::to_value(&config).map_err(|e| e.to_string())?;
    settings_value["initial_cards"] = serde_json::json!(initial_cards);
    let settings = serde_json::to_vec_pretty(&settings_value).map_err(|e| e.to_string())?;
    std::fs::write(backend.root.join("connection.json"), settings).map_err(|e| e.to_string())?;
    runtime.connect(config).await?;
    runtime
        .action(Action::Time {
            utc: Some(tetherlock_simulator::runtime::utc_now()),
        })
        .await?;
    backend.configured.store(true, Ordering::SeqCst);
    Ok(())
}
#[tauri::command]
async fn disconnect(backend: State<'_, Backend>) -> Result<(), String> {
    backend.runtime.lock().await.disconnect().await
}
#[tauri::command]
fn settings(backend: State<'_, Backend>) -> Option<serde_json::Value> {
    std::fs::read(backend.root.join("connection.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
}
#[tauri::command]
async fn subscribe(channel: Channel<Display>, backend: State<'_, Backend>) -> Result<u64, String> {
    let epoch = backend.subscription.fetch_add(1, Ordering::SeqCst) + 1;
    backend.acknowledged.store(0, Ordering::SeqCst);
    let runtime = backend.runtime.lock().await.clone();
    let mut snapshots = runtime.snapshots.clone();
    let current = snapshots.borrow_and_update().clone();
    let mut log_revision = current.log_revision;
    let mut in_flight = current.sequence;
    channel
        .send(Display {
            subscription: epoch,
            snapshot: current,
            logs: Some(runtime.logs().await),
        })
        .map_err(|e| e.to_string())?;
    let generation = backend.subscription.clone();
    let acknowledged = backend.acknowledged.clone();
    tauri::async_runtime::spawn(async move {
        while snapshots.changed().await.is_ok() {
            if generation.load(Ordering::SeqCst) != epoch {
                break;
            }
            if acknowledged.load(Ordering::SeqCst) < in_flight {
                continue;
            }
            let snapshot = snapshots.borrow_and_update().clone();
            in_flight = snapshot.sequence;
            let logs = if snapshot.log_revision != log_revision {
                log_revision = snapshot.log_revision;
                Some(runtime.logs().await)
            } else {
                None
            };
            if channel
                .send(Display {
                    subscription: epoch,
                    snapshot,
                    logs,
                })
                .is_err()
            {
                break;
            }
        }
    });
    Ok(epoch)
}
#[tauri::command]
fn acknowledge(epoch: u64, sequence: u64, backend: State<'_, Backend>) {
    if backend.subscription.load(Ordering::SeqCst) == epoch {
        backend.acknowledged.store(sequence, Ordering::SeqCst);
    }
}
#[tauri::command]
async fn show_snapshot(backend: State<'_, Backend>) -> Result<Snapshot, String> {
    backend
        .runtime
        .lock()
        .await
        .snapshot()
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn unsubscribe(epoch: u64, backend: State<'_, Backend>) {
    let _ =
        backend
            .subscription
            .compare_exchange(epoch, epoch + 1, Ordering::SeqCst, Ordering::SeqCst);
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let arguments: Vec<String> = std::env::args().collect();
            let option = |name: &str| {
                arguments
                    .iter()
                    .position(|a| a == name)
                    .and_then(|i| arguments.get(i + 1))
                    .cloned()
            };
            let root = option("--data-dir")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?.join("rust-v2"));
            std::fs::create_dir_all(&root)?;
            let config = std::fs::read(root.join("connection.json"))
                .ok()
                .and_then(|b| serde_json::from_slice::<Connection>(&b).ok());
            let serial = option("--serial")
                .or_else(|| config.as_ref().map(|c| c.serial.clone()))
                .unwrap_or_else(|| "SIM-001".into());
            let config = config.filter(|c| c.serial == serial);
            let initial_cards = option("--initial-cards")
                .and_then(|c| c.parse::<u8>().ok())
                .or_else(|| {
                    std::fs::read(root.join("connection.json"))
                        .ok()
                        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
                        .and_then(|v| v["initial_cards"].as_u64())
                        .and_then(|c| u8::try_from(c).ok())
                })
                .unwrap_or(3);
            let device = Device::new(SimulatorConfig {
                serial: serial.clone(),
                mode: Mode::Simulated,
                initial_cards,
                state_dir: config.as_ref().map(|_| root.join(serial)),
            })?;
            let runtime = tauri::async_runtime::block_on(async { Runtime::start(device) });
            app.manage(Backend {
                runtime: Mutex::new(runtime),
                subscription: Arc::new(AtomicU64::new(0)),
                root,
                configured: AtomicBool::new(config.is_some()),
                acknowledged: Arc::new(AtomicU64::new(0)),
                closing: AtomicBool::new(false),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            operate,
            connect,
            disconnect,
            settings,
            subscribe,
            unsubscribe,
            acknowledge,
            show_snapshot
        ])
        .on_window_event(|window, event| {
            let app = window.app_handle().clone();
            match event {
                tauri::WindowEvent::Focused(false) => {
                    tauri::async_runtime::spawn(async move {
                        let backend = app.state::<Backend>();
                        let runtime = backend.runtime.lock().await;
                        let _ = runtime.action(Action::Button { pressed: false }).await;
                    });
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    if app.state::<Backend>().closing.swap(true, Ordering::SeqCst) {
                        return;
                    }
                    tauri::async_runtime::spawn(async move {
                        {
                            let backend = app.state::<Backend>();
                            backend.subscription.fetch_add(1, Ordering::SeqCst);
                            let runtime = backend.runtime.lock().await;
                            let _ = runtime.action(Action::Button { pressed: false }).await;
                            runtime.shutdown().await;
                        }
                        app.exit(0);
                    });
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("Tauri Linux application failed");
}
