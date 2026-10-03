export interface Inputs {lid_closed:boolean;retracted:boolean;extended:boolean}
export interface Physical {
 lid_angle:number;lid_target:number;bolt_position:number;motion_origin_position:number|null;
 motor_target:string|null;motion_started_ms:number|null;jammed:boolean;automatic:boolean;
 lid_override:boolean|null;retracted_override:boolean|null;extended_override:boolean|null;
 button_pressed:boolean;inputs:Inputs;manual_inputs:Inputs;screen_text:string;screen_progress:number;
}
export interface Snapshot {version:number;session_id:string;sequence:number;simulation_ms:number;paused:boolean;mqtt:string;log_revision:number;physical:Physical;state:{serial:string;control_state:string;fault_code:string|null;remaining_seconds:number|null;task:{task_id:string;operation_id:string;timed:boolean;deadline_utc:number|null}|null;emergency:{remaining:number;total:number;reserved:boolean};revision:number;updated_at_utc:number}}
export interface LogEntry {id:number;simulation_ms:number;message:string}
export interface Display {subscription:number;snapshot:Snapshot;logs?:LogEntry[]}
export type Action = {type:'lid';angle:number}|{type:'button';pressed:boolean}|{type:'pause';paused:boolean}|{type:'step'}|{type:'advance';ms:number}|{type:'time';utc:number|null}|{type:'faults';jammed:boolean;automatic:boolean;lid:boolean|null;retracted:boolean|null;extended:boolean|null}|{type:'inputs';inputs:Inputs}|{type:'reset';confirmation:string};
