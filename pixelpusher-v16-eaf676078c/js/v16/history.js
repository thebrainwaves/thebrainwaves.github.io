// Original Brainhertz Productions code. Bounded snapshot history for edits and strokes.
export class SnapshotHistory{
 constructor(limit=60){this.limit=Math.max(2,Math.min(200,limit|0));this.entries=[];this.cursor=-1;}
 reset(state){this.entries=[state];this.cursor=0;}
 push(state,signature){
  const current=this.entries[this.cursor];
  if(current&&signature!==undefined&&current.signature===signature)return false;
  this.entries.length=this.cursor+1;this.entries.push({...state,signature});this.cursor++;
  while(this.entries.length>this.limit){this.entries.shift();this.cursor--;}
  return true;
 }
 get canUndo(){return this.cursor>0;}
 get canRedo(){return this.cursor<this.entries.length-1;}
 undo(){if(!this.canUndo)return null;this.cursor--;return this.entries[this.cursor];}
 redo(){if(!this.canRedo)return null;this.cursor++;return this.entries[this.cursor];}
 get current(){return this.entries[this.cursor]||null;}
}
