use anyhow::{bail, Context, Result};
use clap::Parser;
use std::path::PathBuf;
use tetherlock_simulator::{
    network::Connection,
    protocol::{self, PublicJwk},
    runtime::{Action, Device, Runtime},
    state::{Inputs, Mode, SimulatorConfig},
};
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Parser)]
#[command(version, about = "TetherLock Linux simulator (shared Rust runtime)")]
struct Args {
    #[arg(long, default_value = "127.0.0.1")]
    broker_host: String,
    #[arg(long, default_value_t = 1883)]
    broker_port: u16,
    #[arg(long, default_value = "tetherlock/v1")]
    namespace: String,
    #[arg(long, default_value = "SIM-001")]
    serial: String,
    #[arg(long)]
    username: Option<String>,
    #[arg(long)]
    password: Option<String>,
    #[arg(long)]
    tls: bool,
    #[arg(long)]
    public_jwk: Option<PathBuf>,
    #[arg(long)]
    state_dir: Option<PathBuf>,
    #[arg(long, default_value_t = 3)]
    initial_cards: u8,
    #[arg(long)]
    paused: bool,
    #[arg(long)]
    scenario: bool,
}
#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let directory = args.state_dir.unwrap_or_else(|| {
        let root = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share")
            });
        root.join("tetherlock-rust-v2").join(&args.serial)
    });
    let mut device = Device::new(SimulatorConfig {
        serial: args.serial.clone(),
        mode: Mode::Simulated,
        initial_cards: args.initial_cards,
        state_dir: Some(directory),
    })?;
    device.paused = args.paused;
    if args.scenario {
        println!("{}", serde_json::to_string(&device.snapshot())?);
        return Ok(());
    }
    let path = args
        .public_jwk
        .context("--public-jwk is required; the simulator accepts public keys only")?;
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(path)?)?;
    if value.get("d").is_some() || value.get("private_jwk").is_some() {
        bail!("private keys are not accepted");
    }
    let key: PublicJwk = serde_json::from_value(value)?;
    println!("fingerprint {}", protocol::fingerprint(&key)?);
    let runtime = Runtime::start(device);
    runtime
        .connect(Connection {
            serial: args.serial,
            broker_host: args.broker_host,
            broker_port: args.broker_port,
            namespace: args.namespace,
            tls: args.tls,
            username: args.username,
            password: args.password,
            public_jwk: key,
        })
        .await
        .map_err(anyhow::Error::msg)?;
    println!("ready rust-v2");
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    loop {
        tokio::select! {
            _=tokio::signal::ctrl_c()=>break,
            line=lines.next_line()=>{
                let Some(line)=line? else {break};
                let words:Vec<_>=line.split_whitespace().collect(); if words.is_empty(){continue;}
                if matches!(words[0],"quit"|"exit") {break;}
                if words[0]=="show" { println!("{}",serde_json::to_string(&runtime.snapshot().await?)?); continue; }
                if words[0]=="logs" { println!("{}",serde_json::to_string(&runtime.logs().await)?); continue; }
                match parse_action(&words,&runtime) {
                    Ok(action)=>if let Err(error)=runtime.action(action).await {eprintln!("rejected {error}");},
                    Err(error)=>eprintln!("rejected {error}"),
                }
            }
        }
    }
    runtime.shutdown().await;
    Ok(())
}
fn boolean(value: &str) -> Result<bool> {
    match value {
        "1" | "true" | "on" | "down" => Ok(true),
        "0" | "false" | "off" | "up" => Ok(false),
        _ => bail!("expected a boolean"),
    }
}
fn parse_action(words: &[&str], runtime: &Runtime) -> Result<Action> {
    let arg = || words.get(1).copied().context("missing argument");
    Ok(match words[0] {
        "advance"=>Action::Advance {ms:arg()?.parse()?},
        "step"=>Action::Step,
        "pause"=>Action::Pause {paused:boolean(arg()?)?},
        "lid"=>Action::Lid {angle:arg()?.parse()?},
        "button"=>Action::Button {pressed:boolean(arg()?)?},
        "time"=>Action::Time {utc:if arg()?=="off" {None}else{Some(arg()?.parse()?)}},
        "reset"=>Action::Reset {confirmation:arg()?.into()},
        "inputs" if words.len()==4=>Action::Inputs {inputs:Inputs {lid_closed:boolean(words[1])?,retracted:boolean(words[2])?,extended:boolean(words[3])?}},
        "jam"|"automatic"=>{
            let snapshot=runtime.snapshots.borrow(); let p=&snapshot.physical;
            Action::Faults {jammed:if words[0]=="jam" {boolean(arg()?)?}else{p["jammed"].as_bool().unwrap_or(false)},
                automatic:if words[0]=="automatic" {boolean(arg()?)?}else{p["automatic"].as_bool().unwrap_or(true)},
                lid:p["lid_override"].as_bool(),retracted:p["retracted_override"].as_bool(),extended:p["extended_override"].as_bool()}
        }
        _=>bail!("commands: lid <0..105>, button down|up, pause on|off, step, advance <ms>, time <utc>|off, jam on|off, automatic on|off, inputs <lid> <retracted> <extended>, reset <serial>, show, logs, quit"),
    })
}
