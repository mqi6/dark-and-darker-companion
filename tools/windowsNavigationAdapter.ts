import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScreenPoint } from "../src/domain/stashScreenCalibration";
import type { GameScreen, NavigationObservation } from "../src/tasks/gameNavigationMachine";
import type { NavigationWindowState, ScreenClassification, WindowsNavigationAdapter } from "../src/tasks/windowsNavigationRuntime";
const execFileAsync=promisify(execFile);
export interface PrivateScreenTemplate { screen: Exclude<GameScreen,"unknown">; feature:number[]; selectedCharacterSlotIndex?:number; selectedStashTabIndex?:number }
export interface PrivateNavProfile { schemaVersion:1; gameBuildFingerprint:string; visibleStashTabs:number; selectedCharacterSlotIndex:number|null; templates:PrivateScreenTemplate[] }
interface HelperState {windowHandle:string;processName:string;clientBounds:{left:number;top:number;width:number;height:number};display:{left:number;top:number;width:number;height:number};feature?:number[]}
export class PowerShellNavigationAdapter implements WindowsNavigationAdapter {
 constructor(private helper:string,private profile:PrivateNavProfile,private expected:HelperState,private capturePath:string){}
 async inspectWindow():Promise<NavigationWindowState>{const s=await this.run(["-Inspect"]);return{...s,gameBuildFingerprint:this.profile.gameBuildFingerprint}}
 async classifyScreen():Promise<ScreenClassification>{const s=await this.run(["-Capture","-OutputPath",this.capturePath]);if(!s.feature)return{status:"unknown"};return classifyFeature(s.feature,this.profile.templates)}
 async clickForeground(point:ScreenPoint){const b=this.expected.clientBounds;try{const s=await this.run(["-Click","-ExpectedWindowHandle",this.expected.windowHandle,"-ExpectedLeft",String(b.left),"-ExpectedTop",String(b.top),"-ExpectedWidth",String(b.width),"-ExpectedHeight",String(b.height),"-X",String(Math.round(point.x)),"-Y",String(Math.round(point.y))]);return s as unknown as {status:"clicked"}}catch{return{status:"rejected" as const,diagnosticCode:"send-input-rejected"}}}
 private async run(args:string[]):Promise<HelperState&Record<string,unknown>>{const r=await execFileAsync("powershell.exe",["-NoProfile","-ExecutionPolicy","Bypass","-File",this.helper,...args],{encoding:"utf8",windowsHide:true,maxBuffer:2*1024*1024});return JSON.parse(r.stdout)}
}
export function classifyFeature(feature:number[],templates:PrivateScreenTemplate[]):ScreenClassification{
 if(feature.length===0||templates.length===0)return{status:"unknown"};const scored=templates.map(t=>({t,score:meanDifference(feature,t.feature)})).sort((a,b)=>a.score-b.score);const best=scored[0];if(!best||best.score>28)return{status:"unknown"};if(scored[1]&&scored[1].score-best.score<3)return{status:"ambiguous"};const observation:NavigationObservation={screen:best.t.screen,...(best.t.selectedCharacterSlotIndex===undefined?{}:{selectedCharacterSlotIndex:best.t.selectedCharacterSlotIndex}),...(best.t.selectedStashTabIndex===undefined?{}:{selectedStashTabIndex:best.t.selectedStashTabIndex})};return{status:"classified",observation};
}
function meanDifference(a:number[],b:number[]){if(a.length!==b.length)return Infinity;return a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]!),0)/a.length}
