// Manual records are scoped to immutable CAD + step definition fingerprints.
export const progressKey='TetherLock.assembly.records.v1';
export const progressSignature=data=>`${data.cadFingerprint}:${data.assembly.version}:${data.assemblyFingerprint}`;
export function emptyRecord(data) {return {cadFingerprint:data.cadFingerprint,stepVersion:data.assembly.version,stepFingerprint:data.assemblyFingerprint,currentStep:data.assembly.steps[0].id,checks:{},completed:[],notes:{},updatedAt:null};}
export function sanitizeRecord(record,data) {
  const r=emptyRecord(data),steps=data.assembly.steps;
  if(record?.cadFingerprint!==r.cadFingerprint||record?.stepVersion!==r.stepVersion||record?.stepFingerprint!==r.stepFingerprint)return r;
  if(steps.some(s=>s.id===record.currentStep))r.currentStep=record.currentStep;
  for(const s of steps){for(const c of s.checks)if(typeof record.checks?.[c.id]==='boolean')r.checks[c.id]=record.checks[c.id];if(typeof record.notes?.[s.id]==='string')r.notes[s.id]=record.notes[s.id].slice(0,10000);if(Array.isArray(record.completed)&&record.completed.includes(s.id)&&s.checks.filter(c=>c.required).every(c=>r.checks[c.id]))r.completed.push(s.id);}
  r.updatedAt=typeof record.updatedAt==='string'?record.updatedAt:null;return r;
}
export class AssemblyProgress {
  constructor(data,storage) {
    this.data=data;this.storage=storage;this.signature=progressSignature(data);this.records={};this.persistent=true;this.message='';
    try {this.storage=storage??globalThis.localStorage;const raw=this.storage.getItem(progressKey);if(raw){const parsed=JSON.parse(raw);if(parsed.schema!==1||!parsed.records||typeof parsed.records!=='object')throw new Error('进度格式无效');this.records=parsed.records;}}
    catch(e){this.persistent=false;this.message='无法读取本机进度；指导仍可使用，请通过JSON保存记录。';}
    this.record=sanitizeRecord(this.records[this.signature],data);
    this.archived=Object.keys(this.records).filter(k=>k!==this.signature).length;
  }
  save() {
    this.record.updatedAt=new Date().toISOString();this.records[this.signature]=structuredClone(this.record);
    try{this.storage.setItem(progressKey,JSON.stringify(this.export()));this.persistent=true;}catch{this.persistent=false;this.message='浏览器无法持久保存，请导出JSON保留当前人工记录。';}
  }
  check(id,value) {this.record.checks[id]=Boolean(value);this.record.completed=this.record.completed.filter(step=>this.data.assembly.steps.find(s=>s.id===step).checks.filter(c=>c.required).every(c=>this.record.checks[c.id]));this.save();}
  complete(id) {const s=this.data.assembly.steps.find(s=>s.id===id);if(!s||!s.checks.filter(c=>c.required).every(c=>this.record.checks[c.id]))throw new Error('先人工确认本步所有检查项');if(!this.record.completed.includes(id))this.record.completed.push(id);this.save();}
  reset() {this.records[this.signature+':reset:'+new Date().toISOString()]=structuredClone(this.record);this.record=emptyRecord(this.data);this.archived++;this.save();}
  export() {return {schema:1,records:structuredClone(this.records),exportedAt:new Date().toISOString(),meaning:'仅为人工记录，不代表自动检测实物合格'};}
  import(value) {
    if(value?.schema!==1||!value.records||Array.isArray(value.records)||typeof value.records!=='object')throw new Error('进度JSON格式无效，现有记录保留');
    for(const [key,record] of Object.entries(value.records)){
      if(!record||typeof record!=='object'||typeof record.cadFingerprint!=='string'||typeof record.stepVersion!=='string'||typeof record.stepFingerprint!=='string')throw new Error('进度记录缺少CAD/步骤版本，现有记录保留');
      if(key!==`${record.cadFingerprint}:${record.stepVersion}:${record.stepFingerprint}`&&!key.includes(':reset:'))throw new Error('进度索引与版本不匹配，现有记录保留');
    }
    const merged={...this.records,...value.records};this.records=merged;this.record=sanitizeRecord(merged[this.signature],this.data);this.archived=Object.keys(merged).filter(k=>k!==this.signature).length;this.save();
  }
}
