export type Vec3 = { x: number; y: number; z: number };

export type SpawnItem = {
  BotZoneName: string;
  Categories: string[]; // ["Player","Bot","Boss",...]
  ColliderParams: {
    _parent: string; // "SpawnSphereParams"
    _props: { Center: Vec3; Radius: number };
  };
  CorePointId: number;
  DelayToCanSpawnSec: number;
  Id: string;           // GUID
  Infiltration: string; // may be "" or "E3_4" etc
  Position: Vec3;
  Rotation: number;
  Sides: string[];      // ["All"] | ["Savage"] | ["PmcPmc"] ...
};