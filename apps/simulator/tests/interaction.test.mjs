import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Gesture} from '../src/interaction.ts';
test('a camera drag that returns to its origin is never a click',()=>{const g=new Gesture();g.down(0,0);g.move(20,0);assert.equal(g.up(0,0),false);});
test('five CSS pixels remain a click but larger movement cancels',()=>{const g=new Gesture();g.down(10,10);assert.equal(g.up(13,14),true);g.down(10,10);assert.equal(g.up(13,15),false);});
test('cancelled and lost gestures cannot click later',()=>{const g=new Gesture();g.down(0,0);g.cancel();assert.equal(g.up(0,0),false);});
