/** Only short, completed gestures can become model clicks. */
export class Gesture {
 private start:[number,number]|null=null;
 private dragged=false;
 down(x:number,y:number){this.start=[x,y];this.dragged=false;}
 move(x:number,y:number){if(this.start&&Math.hypot(x-this.start[0],y-this.start[1])>5)this.dragged=true;}
 up(x:number,y:number){this.move(x,y);const click=this.start!==null&&!this.dragged;this.cancel();return click;}
 cancel(){this.start=null;this.dragged=false;}
}
