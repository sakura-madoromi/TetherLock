//! MQTT polling and publishing have separate tasks; neither waits in the state owner.
use crate::{
    protocol::{topic_prefix, PublicJwk},
    runtime::Message,
};
use anyhow::{bail, Result};
use rumqttc::{AsyncClient, Event, LastWill, MqttOptions, Packet, QoS, Transport};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::{
    sync::{mpsc, watch},
    task::JoinHandle,
};

#[derive(Clone, Deserialize, Serialize)]
pub struct Connection {
    pub serial: String,
    pub broker_host: String,
    pub broker_port: u16,
    pub namespace: String,
    pub tls: bool,
    pub username: Option<String>,
    #[serde(skip_serializing)]
    pub password: Option<String>,
    pub public_jwk: PublicJwk,
}
impl Connection {
    pub fn validate(&self) -> Result<()> {
        if self.serial.is_empty()
            || self.serial.len() > 64
            || !self
                .serial
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            bail!("invalid_serial");
        }
        if self.broker_host.trim().is_empty()
            || self.broker_port == 0
            || self.namespace.is_empty()
            || self.namespace.contains(['+', '#'])
        {
            bail!("invalid_broker_configuration");
        }
        crate::protocol::fingerprint(&self.public_jwk)?;
        Ok(())
    }
}
pub enum Incoming {
    Status(String),
    Challenge(Vec<u8>),
    Command(Vec<u8>),
}
pub enum Outgoing {
    Challenge(Vec<u8>),
    Result(Vec<u8>),
}
pub struct Network {
    outgoing: mpsc::UnboundedSender<Outgoing>,
    pub state: watch::Sender<Vec<u8>>,
    shutdown: watch::Sender<bool>,
    task: JoinHandle<()>,
}
impl Network {
    pub fn send(&self, message: Outgoing) {
        let _ = self.outgoing.send(message);
    }
    pub async fn stop(self) {
        self.shutdown.send_replace(true);
        let mut task = self.task;
        if tokio::time::timeout(Duration::from_millis(300), &mut task)
            .await
            .is_err()
        {
            task.abort();
        }
    }
}
pub fn start(config: Connection, generation: u64, actor: mpsc::Sender<Message>) -> Network {
    let (outgoing, mut messages) = mpsc::unbounded_channel();
    let (state, mut states) = watch::channel(Vec::new());
    let (shutdown, mut stopped) = watch::channel(false);
    let task = tokio::spawn(async move {
        let prefix = topic_prefix(&config.serial, &config.namespace);
        let availability = format!("{prefix}/availability");
        let challenge = format!("{prefix}/challenge/request");
        let command = format!("{prefix}/command");
        let mut options = MqttOptions::new(
            format!("tauri-{}-{}", config.serial, uuid::Uuid::new_v4()),
            &config.broker_host,
            config.broker_port,
        );
        options.set_keep_alive(Duration::from_secs(20));
        options.set_last_will(LastWill::new(
            &availability,
            "offline",
            QoS::AtLeastOnce,
            true,
        ));
        if config.tls {
            options.set_transport(Transport::tls_with_default_config());
        }
        if let Some(user) = config.username {
            options.set_credentials(user, config.password.unwrap_or_default());
        }
        let (client, mut eventloop) = AsyncClient::new(options, 64);
        let (connected, mut online) = watch::channel(false);
        let mut jobs = tokio::task::JoinSet::new();
        let publisher = client.clone();
        let publish_prefix = prefix.clone();
        let publish_availability = availability.clone();
        jobs.spawn(async move {
            loop {
                tokio::select! {
                    changed=online.changed()=>{
                        if changed.is_err() { break; }
                        if *online.borrow_and_update() {
                            let _=publisher.subscribe(format!("{publish_prefix}/challenge/request"),QoS::AtLeastOnce).await;
                            let _=publisher.subscribe(format!("{publish_prefix}/command"),QoS::AtLeastOnce).await;
                            let _=publisher.publish(&publish_availability,QoS::AtLeastOnce,true,"online").await;
                            let bytes=states.borrow().clone();
                            if !bytes.is_empty() { let _=publisher.publish(format!("{publish_prefix}/state"),QoS::AtLeastOnce,true,bytes).await; }
                        }
                    }
                    changed=states.changed()=>{
                        if changed.is_err() { break; }
                        let bytes=states.borrow_and_update().clone();
                        if *online.borrow() && !bytes.is_empty() { let _=publisher.publish(format!("{publish_prefix}/state"),QoS::AtLeastOnce,true,bytes).await; }
                    }
                    Some(message)=messages.recv()=>{
                        let (suffix,bytes)=match message { Outgoing::Challenge(b)=>("challenge/response",b),Outgoing::Result(b)=>("result",b) };
                        let _=publisher.publish(format!("{publish_prefix}/{suffix}"),QoS::AtLeastOnce,false,bytes).await;
                    }
                }
            }
        });
        let mut attempt = 0usize;
        loop {
            tokio::select! {
                _=stopped.changed()=>{
                    jobs.abort_all();
                    let _=client.try_publish(&availability,QoS::AtLeastOnce,true,"offline");
                    let _=client.try_disconnect();
                    let _=tokio::time::timeout(Duration::from_millis(200),async { loop { if matches!(eventloop.poll().await,Ok(Event::Outgoing(rumqttc::Outgoing::Disconnect))) { break; } } }).await;
                    break;
                }
                event=eventloop.poll()=>{
                    let incoming=match event {
                        Ok(Event::Incoming(Packet::ConnAck(_)))=>{ attempt=0; connected.send_replace(true); Some(Incoming::Status("connected".into())) },
                        Ok(Event::Incoming(Packet::Publish(p))) if p.topic==challenge =>Some(Incoming::Challenge(p.payload.to_vec())),
                        Ok(Event::Incoming(Packet::Publish(p))) if p.topic==command =>Some(Incoming::Command(p.payload.to_vec())),
                        Err(error)=>{
                            connected.send_replace(false);
                            let delay=[1,2,4,8,16,30][attempt.min(5)]; attempt+=1;
                            let _=actor.send(Message::Network {generation,event:Incoming::Status(format!("reconnecting ({delay}s): {error}"))}).await;
                            tokio::select! { _=tokio::time::sleep(Duration::from_secs(delay))=>{}, _=stopped.changed()=>break }
                            None
                        }
                        _=>None,
                    };
                    if let Some(event)=incoming { if actor.send(Message::Network { generation,event }).await.is_err() { break; } }
                }
            }
        }
    });
    Network {
        outgoing,
        state,
        shutdown,
        task,
    }
}
