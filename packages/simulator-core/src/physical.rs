use crate::state::Inputs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Physical {
    pub lid_angle: f64,
    pub lid_target: f64,
    pub bolt_position: f64,
    pub motion_origin_position: Option<f64>,
    pub jammed: bool,
    pub automatic: bool,
    pub lid_override: Option<bool>,
    pub retracted_override: Option<bool>,
    pub extended_override: Option<bool>,
    pub manual_inputs: Inputs,
    pub screen_text: String,
    pub screen_progress: u8,
}
impl Default for Physical {
    fn default() -> Self {
        Self {
            lid_angle: 105.,
            lid_target: 105.,
            bolt_position: 0.,
            motion_origin_position: None,
            jammed: false,
            automatic: true,
            lid_override: None,
            retracted_override: None,
            extended_override: None,
            manual_inputs: Inputs {
                lid_closed: false,
                retracted: true,
                extended: false,
            },
            screen_text: "已退栓".into(),
            screen_progress: 0,
        }
    }
}
impl Physical {
    pub fn inputs(&self) -> Inputs {
        if !self.automatic {
            return self.manual_inputs.clone();
        }
        Inputs {
            lid_closed: self.lid_override.unwrap_or(self.lid_angle <= 0.),
            retracted: self.retracted_override.unwrap_or(self.bolt_position <= 0.),
            extended: self.extended_override.unwrap_or(self.bolt_position >= 14.),
        }
    }
    pub fn advance(&mut self, ms: u64, motor: Option<&str>) {
        let delta = 105. * ms as f64 / 600.;
        self.lid_angle = approach(self.lid_angle, self.lid_target, delta);
        if !self.jammed {
            match motor {
                Some("extend") => {
                    self.bolt_position = approach(self.bolt_position, 14., 14. * ms as f64 / 2000.)
                }
                Some("retract") => {
                    self.bolt_position = approach(self.bolt_position, 0., 14. * ms as f64 / 2000.)
                }
                _ => {}
            }
        }
    }
}
fn approach(value: f64, target: f64, delta: f64) -> f64 {
    if (value - target).abs() <= delta + 1e-9 {
        target
    } else {
        value + (target - value).signum() * delta
    }
}
