import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTheme, resolvedTheme, remainingTime, controlLabel} from '../src/theme.ts';
test('theme preference defaults to system and explicit choices override OS appearance',()=>{
 assert.equal(parseTheme(null),'system');assert.equal(parseTheme('invalid'),'system');
 assert.equal(resolvedTheme('system',true),'dark');assert.equal(resolvedTheme('system',false),'light');
 assert.equal(resolvedTheme('light',true),'light');assert.equal(resolvedTheme('dark',false),'dark');
});
test('countdown clamps expired time and distinguishes seconds and days',()=>{
 assert.equal(remainingTime(-1),'00:00:00');assert.equal(remainingTime(5401),'01:30:01');assert.equal(remainingTime(90000),'1 天 01 时');
});
test('device wire states have readable labels, and unknown values remain inspectable',()=>{
 assert.equal(controlLabel('idle_retracted'),'空闲已退栓');assert.equal(controlLabel('timed_locked'),'定时锁定');assert.equal(controlLabel('new_state'),'new_state');
});
