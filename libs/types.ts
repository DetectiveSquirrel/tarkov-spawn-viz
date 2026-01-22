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

// Full data structure types
export type SpawnPointParam = {
  BotZoneName?: string;
  Categories: string[];
  ColliderParams: {
    _parent: string;
    _props: {
      Center: Vec3;
      Radius?: number;
      Size?: Vec3;
    };
  };
  CorePointId?: number;
  DelayToCanSpawnSec: number;
  Id: string;
  Infiltration: string;
  Position: Vec3;
  Rotation: number;
  Sides: string[];
};

export type LocationData = {
  Id: string;
  Name: string;
  OpenZones?: string;
  SpawnPointParams?: SpawnPointParam[];
  [key: string]: any; // Allow other properties
};

export type LocationsData = {
  [key: string]: LocationData;
};

export type FullDataStructure = {
  locations: LocationsData;
  paths?: any[];
};