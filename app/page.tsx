'use client';

import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Line } from '@react-three/drei';
import { Color, OrthographicCamera, PerspectiveCamera } from 'three';
import type { SpawnItem, FullDataStructure, LocationData, SpawnPointParam } from '@/libs/types';

type HoverInfo = { item: SpawnItem; index: number } | null;

type CategoryKey = 'Boss' | 'Player' | 'Bot' | 'Other';
type ColorMode = 'Category' | 'Side' | 'Zone';
type Rot = -45 | 0 | 90 | 180 | 270;

function colorForCategory(categories: string[]): string {
  if (categories?.includes('Boss')) return '#ff5252';
  if (categories?.includes('Player')) return '#4fc3f7';
  if (categories?.includes('Bot')) return '#a5d6a7';
  return '#bdbdbd';
}

function hashToColorHex(input: string, s = 70, l = 58): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  const hue = Math.abs(h) % 360;
  const c = new Color();
  c.setHSL(hue / 360, s / 100, l / 100);
  return c.getHex();
}

function colorBySideHex(sides: string[]): number {
  const key = sides?.join(',') || '(none)';
  return hashToColorHex(key);
}

function colorByZoneHex(zone: string): number {
  const key = zone || '(none)';
  return hashToColorHex(key, 65, 55);
}

function scaleFromRadius(radius: number, mode: 'radius' | 'fixed', multiplier: number): number {
  const m = Math.max(0.1, Math.min(multiplier, 10));
  if (mode === 'fixed') return 8 * m;
  const r = Math.max(5, Math.min((radius || 10) * 0.4, 22));
  return r * m;
}

function fmt(n: number) {
  return Math.round(n * 1000) / 1000;
}

function FitCamera({ points, topDown }: { points: Array<[number, number, number]>; topDown: boolean }) {
  const { camera, controls, size, set } = useThree((state: any) => ({
    camera: state.camera,
    controls: (state as any).controls,
    size: state.size,
    set: state.set
  }));

  useEffect(() => {
    if (!points?.length) return;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const [x, y, z] of points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;

    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    const radius = Math.max(dx, dy, dz) * 0.6 + 80;

    if (topDown) {
      // Switch to orthographic camera for top-down view
      if (!(camera instanceof OrthographicCamera)) {
        const orthoCamera = new OrthographicCamera();
        orthoCamera.position.copy(camera.position);
        orthoCamera.rotation.copy(camera.rotation);
        orthoCamera.up.copy(camera.up);
        set({ camera: orthoCamera });
      }
      
      const orthoCam = camera as OrthographicCamera;
      const height = Math.max(radius * 1.5, 200);
      orthoCam.position.set(cx, cy + height, cz);
      orthoCam.lookAt(cx, cy, cz);
      orthoCam.up.set(0, 1, 0);
      
      // Set orthographic bounds based on data extent
      const orthoSize = Math.max(dx, dz) * 0.6 + 100;
      const aspect = size.width / size.height;
      orthoCam.left = -orthoSize * aspect;
      orthoCam.right = orthoSize * aspect;
      orthoCam.top = orthoSize;
      orthoCam.bottom = -orthoSize;
      orthoCam.near = 0.1;
      orthoCam.far = Math.max(5000, height * 2);
      orthoCam.updateProjectionMatrix();
    } else {
      // Switch back to perspective camera
      if (!(camera instanceof PerspectiveCamera)) {
        const perspCamera = new PerspectiveCamera(50, size.width / size.height, 0.1, 10000);
        perspCamera.position.copy(camera.position);
        perspCamera.rotation.copy(camera.rotation);
        perspCamera.up.copy(camera.up);
        set({ camera: perspCamera });
      }
      
      const perspCam = camera as PerspectiveCamera;
      perspCam.aspect = size.width / size.height;
      perspCam.position.set(cx + radius, cy + radius * 0.7, cz + radius);
      perspCam.up.set(0, 1, 0);
      perspCam.near = 0.1;
      perspCam.far = Math.max(5000, radius * 20);
      perspCam.updateProjectionMatrix();
    }

    if (controls) {
      controls.target.set(cx, cy, cz);
      if (topDown) {
        // Lock controls to top-down when enabled
        (controls as any).minPolarAngle = 0;
        (controls as any).maxPolarAngle = Math.PI;
        (controls as any).enableRotate = false;
      } else {
        // Restore normal controls
        (controls as any).minPolarAngle = 0;
        (controls as any).maxPolarAngle = Math.PI;
        (controls as any).enableRotate = true;
      }
      (controls as any).update();
    }
  }, [points, camera, controls, topDown, size, set]);

  // Update orthographic camera bounds on window resize
  useEffect(() => {
    if (topDown && camera instanceof OrthographicCamera) {
      const orthoCam = camera as OrthographicCamera;
      const aspect = size.width / size.height;
      // Use the top value as the base vertical size
      const baseSize = orthoCam.top;
      orthoCam.left = -baseSize * aspect;
      orthoCam.right = baseSize * aspect;
      orthoCam.top = baseSize;
      orthoCam.bottom = -baseSize;
      orthoCam.updateProjectionMatrix();
    } else if (!topDown && camera instanceof PerspectiveCamera) {
      const perspCam = camera as PerspectiveCamera;
      perspCam.aspect = size.width / size.height;
      perspCam.updateProjectionMatrix();
    }
  }, [size, topDown, camera]);

  return null;
}

// Helper function to convert SpawnPointParam to SpawnItem
function convertSpawnPointParamToSpawnItem(param: SpawnPointParam, openZones?: string): SpawnItem {
  return {
    BotZoneName: param.BotZoneName || '',
    Categories: param.Categories || [],
    ColliderParams: {
      _parent: param.ColliderParams._parent,
      _props: {
        Center: param.ColliderParams._props.Center,
        Radius: param.ColliderParams._props.Radius ?? 50
      }
    },
    CorePointId: param.CorePointId ?? 0,
    DelayToCanSpawnSec: param.DelayToCanSpawnSec,
    Id: param.Id,
    Infiltration: param.Infiltration || '',
    Position: param.Position,
    Rotation: param.Rotation,
    Sides: param.Sides || []
  };
}

export default function Page() {
  const [data, setData] = useState<SpawnItem[]>([]);
  const [fullData, setFullData] = useState<FullDataStructure | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [hover, setHover] = useState<HoverInfo>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);

  const [colorMode, setColorMode] = useState<ColorMode>('Category');
  const [scaleMode, setScaleMode] = useState<'radius' | 'fixed'>('fixed');
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1);
  const [showZones, setShowZones] = useState<boolean>(true);
  const [showInfiltrations, setShowInfiltrations] = useState<boolean>(false);
  const [showInactiveSpawns, setShowInactiveSpawns] = useState<boolean>(false);
  const [topDownView, setTopDownView] = useState<boolean>(false);
  // Paste JSON overlay
  const [showPaste, setShowPaste] = useState<boolean>(false);
  const [pasteText, setPasteText] = useState<string>('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  // Orientation controls
  const [flipX, setFlipX] = useState<boolean>(true);
  const [flipZ, setFlipZ] = useState<boolean>(false);
  const [rotateDeg, setRotateDeg] = useState<Rot>(-45);
  const [rotateAroundCenter, setRotateAroundCenter] = useState<boolean>(true);

  const [categoryFilter, setCategoryFilter] = useState<Record<CategoryKey, boolean>>({
    Boss: true,
    Player: true,
    Bot: true,
    Other: true
  });
  const [sideFilter, setSideFilter] = useState<Record<string, boolean>>({});

  const [search, setSearch] = useState<string>('');

  const initFromData = (json: SpawnItem[]) => {
    const sides = new Set<string>();
    for (const it of json ?? []) {
      for (const s of it.Sides ?? []) sides.add(s);
    }
    const initial: Record<string, boolean> = {};
    for (const s of Array.from(sides)) initial[s] = true;
    setSideFilter(initial);
  };

  const loadDefault = async () => {
    const res = await fetch('params.json', { cache: 'no-store' });
    const json = (await res.json()) as SpawnItem[];
    setData(json ?? []);
    initFromData(json ?? []);
    setSelectedLocationId('');
    setFullData(null);
  };

  const loadLocationData = async () => {
    try {
      const res = await fetch('data.json', { cache: 'no-store' });
      const json = (await res.json()) as FullDataStructure;
      setFullData(json);
      
      // If locations exist, populate location selector
      if (json.locations && Object.keys(json.locations).length > 0) {
        // Optionally auto-select first location
        const firstLocationId = Object.values(json.locations)[0]?.Id;
        if (firstLocationId) {
          setSelectedLocationId(firstLocationId);
        }
      }
    } catch (err) {
      console.error('Failed to load location data:', err);
    }
  };

  // Load location data on mount
  useEffect(() => {
    loadLocationData();
  }, []);

  // Automatically set rotation to 0 when top-down view is enabled
  useEffect(() => {
    if (topDownView) {
      setRotateDeg(0);
    }
  }, [topDownView]);

  // Load spawn points when location is selected
  useEffect(() => {
    if (!fullData || !selectedLocationId) return;
    
    const location = Object.values(fullData.locations || {}).find(
      loc => loc.Id === selectedLocationId
    );
    
    if (location && location.SpawnPointParams) {
      const spawnItems = location.SpawnPointParams.map(param => 
        convertSpawnPointParamToSpawnItem(param, location.OpenZones)
      );
      setData(spawnItems);
      initFromData(spawnItems);
    }
  }, [selectedLocationId, fullData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Only load default if no location is selected
      if (selectedLocationId) return;
      
      try {
        const cached = typeof window !== 'undefined' ? localStorage.getItem('spawn_json_v1') : null;
        if (cached) {
          const json = JSON.parse(cached) as SpawnItem[];
          if (!cancelled) {
            setData(json ?? []);
            initFromData(json ?? []);
          }
          return;
        }
      } catch {}
      const res = await fetch('params.json', { cache: 'no-store' });
      const json = (await res.json()) as SpawnItem[];
      if (!cancelled) {
        setData(json ?? []);
        initFromData(json ?? []);
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [selectedLocationId]);

  const items = data;

  // Get current location's OpenZones for inactive spawn filtering
  const currentLocationOpenZones = useMemo(() => {
    if (!fullData || !selectedLocationId) return '';
    const location = Object.values(fullData.locations || {}).find(
      loc => loc.Id === selectedLocationId
    );
    return location?.OpenZones || '';
  }, [fullData, selectedLocationId]);

  const filtered = useMemo(() => {
    const searchLC = search.trim().toLowerCase();
    return items.filter((i) => {
      const catColorKey: CategoryKey =
        i.Categories?.includes('Boss') ? 'Boss'
        : i.Categories?.includes('Player') ? 'Player'
        : i.Categories?.includes('Bot') ? 'Bot'
        : 'Other';
      if (!categoryFilter[catColorKey]) return false;

      const hasAnySide = (i.Sides ?? []).some(s => sideFilter[s] ?? false);
      if (!hasAnySide) return false;

      // Filter inactive spawns if option is enabled
      if (!showInactiveSpawns && selectedLocationId && currentLocationOpenZones && i.BotZoneName) {
        // Check if BotZoneName is NOT in OpenZones (spawn is inactive)
        const openZonesList = currentLocationOpenZones.split(',').map(z => z.trim());
        const isInactive = !openZonesList.includes(i.BotZoneName);
        if (isInactive) return false;
      }

      if (searchLC) {
        const zone = (i.BotZoneName || '').toLowerCase();
        const id = (i.Id || '').toLowerCase();
        if (!zone.includes(searchLC) && !id.includes(searchLC)) return false;
      }
      return true;
    });
  }, [items, categoryFilter, sideFilter, search, showInactiveSpawns, selectedLocationId, currentLocationOpenZones]);

  const basePositions = useMemo(
    () => filtered.map(i => [i.Position.x, i.Position.y, i.Position.z] as [number, number, number]),
    [filtered]
  );

  const transformed = useMemo(() => {
    if (basePositions.length === 0) return { positions: basePositions, cx: 0, cz: 0 };
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const [x, , z] of basePositions) {
      if (x < minX) minX = x; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const r = (Math.PI / 180) * rotateDeg;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const positions = basePositions.map(([x, y, z]) => {
      let tx = rotateAroundCenter ? x - cx : x;
      let tz = rotateAroundCenter ? z - cz : z;
      if (flipX) tx = -tx;
      if (flipZ) tz = -tz;
      const rx = tx * cos - tz * sin;
      const rz = tx * sin + tz * cos;
      const fx = rotateAroundCenter ? rx + cx : rx;
      const fz = rotateAroundCenter ? rz + cz : rz;
      return [fx, y, fz] as [number, number, number];
    });
    return { positions, cx, cz };
  }, [basePositions, flipX, flipZ, rotateDeg, rotateAroundCenter]);
  const scales = useMemo(
    () => filtered.map(i => scaleFromRadius(i.ColliderParams?._props?.Radius ?? 10, scaleMode, scaleMultiplier)),
    [filtered, scaleMode, scaleMultiplier]
  );
  const colorsStr = useMemo(() => {
    return filtered.map(i => {
      if (colorMode === 'Category') return colorForCategory(i.Categories);
      if (colorMode === 'Side') {
        const c = new Color();
        c.setHex(colorBySideHex(i.Sides));
        return `#${c.getHexString()}`;
      }
      const c = new Color();
      c.setHex(colorByZoneHex(i.BotZoneName));
      return `#${c.getHexString()}`;
    });
  }, [filtered, colorMode]);

  const selectedItem: SpawnItem | null = useMemo(() => {
    if (pinnedIndex != null && filtered[pinnedIndex]) return filtered[pinnedIndex] ?? null;
    return hover?.item ?? null;
  }, [pinnedIndex, filtered, hover]);

  // Build convex hulls for zones (XZ plane) based on transformed positions
  const zoneHulls = useMemo(() => {
    const map = new Map<string, Array<[number, number]>>();
    filtered.forEach((it, idx) => {
      const name = (it.BotZoneName || '').trim();
      if (!name) return;
      const arr = map.get(name) || [];
      const [x, , z] = transformed.positions[idx] || [it.Position.x, it.Position.y, it.Position.z];
      arr.push([x, z]);
      map.set(name, arr);
    });
    const result: Array<{ zone: string; points: Array<[number, number, number]>; color: string }> = [];
    for (const [zone, pts] of map) {
      if (pts.length < 3) continue;
      const hull2d = convexHull2D(pts);
      if (hull2d.length >= 3) {
        const c = new Color();
        c.setHSL((Math.abs(zone.split('').reduce((a, ch) => (a << 5) - a + ch.charCodeAt(0), 0)) % 360) / 360, 0.55, 0.5);
        const color = `#${c.getHexString()}`;
        // Convert to 3D at a small Y height
        const poly3: Array<[number, number, number]> = hull2d.map(([x, z]) => [x, 0.1, z]);
        // close the loop by repeating first point
        poly3.push([poly3[0][0], poly3[0][1], poly3[0][2]]);
        result.push({ zone, points: poly3, color });
      }
    }
    return result;
  }, [filtered, transformed.positions]);

  // Build convex hulls for Infiltration groups (XZ plane)
  const infiltrationHulls = useMemo(() => {
    const map = new Map<string, Array<[number, number]>>();
    filtered.forEach((it, idx) => {
      const inf = (it.Infiltration || '').trim();
      if (!inf) return;
      const arr = map.get(inf) || [];
      const [x, , z] = transformed.positions[idx] || [it.Position.x, it.Position.y, it.Position.z];
      arr.push([x, z]);
      map.set(inf, arr);
    });
    const result: Array<{ key: string; points: Array<[number, number, number]>; color: string }> = [];
    for (const [key, pts] of map) {
      if (pts.length < 3) continue;
      const hull2d = convexHull2D(pts);
      if (hull2d.length >= 3) {
        const c = new Color();
        c.setHSL((Math.abs(key.split('').reduce((a, ch) => (a << 5) - a + ch.charCodeAt(0), 0)) % 360) / 360, 0.6, 0.6);
        const color = `#${c.getHexString()}`;
        const poly3: Array<[number, number, number]> = hull2d.map(([x, z]) => [x, 0.08, z]);
        poly3.push([poly3[0][0], poly3[0][1], poly3[0][2]]);
        result.push({ key, points: poly3, color });
      }
    }
    return result;
  }, [filtered, transformed.positions]);

  return (
    <div style={{ display: 'flex', height: '100dvh', width: '100%', overflow: 'hidden', background: '#0b0f18' }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <Canvas camera={{ position: [0, 250, 500], fov: 50 }}>
          <color attach="background" args={['#0b0f18']} />
          <ambientLight intensity={0.35} />
          <hemisphereLight intensity={0.45} />
          <directionalLight position={[200, 300, 200]} intensity={0.9} />
          <Grid args={[2000, 2000]} sectionColor="#1e293b" cellColor="#0f172a" infiniteGrid cellSize={5} sectionThickness={1} />

          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
          <FitCamera points={transformed.positions} topDown={topDownView} />

          {filtered.map((item, index) => (
            <mesh
              key={item.Id || `m-${index}`}
              position={transformed.positions[index]}
              scale={scales[index]}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover({ item, index }); }}
              onPointerOut={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover((curr) => (curr?.index === index ? null : curr)); }}
              onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); setPinnedIndex((curr) => (curr === index ? null : index)); }}
           >
              <sphereGeometry args={[1, 16, 16]} />
              <meshStandardMaterial color={colorsStr[index]} metalness={0.05} roughness={0.85} />
            </mesh>
          ))}

          {showZones && zoneHulls.map(({ zone, points, color }) => (
            <Line key={`zone-${zone}`} points={points} color={color} lineWidth={1.5} dashed={false} />
          ))}
          {showInfiltrations && infiltrationHulls.map(({ key, points, color }) => (
            <Line key={`inf-${key}`} points={points} color={color} lineWidth={1} dashed />
          ))}
        </Canvas>

        <div style={{
          position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8,
          background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #1f2937', padding: 10, borderRadius: 8, color: '#e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#93c5fd' }}>Visible</span>
            <strong>{filtered.length}</strong>
            <span style={{ color: '#64748b' }}>/ {items.length}</span>
          </div>
          <div style={{ width: 1, background: '#1f2937' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#93c5fd' }}>Color</label>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as ColorMode)}
              style={{ background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 6, padding: '4px 6px' }}
            >
              <option value="Category">Category</option>
              <option value="Side">Side</option>
              <option value="Zone">Zone</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#93c5fd' }}>Scale</label>
            <select
              value={scaleMode}
              onChange={(e) => setScaleMode(e.target.value as any)}
              style={{ background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 6, padding: '4px 6px' }}
            >
              <option value="radius">By Radius</option>
              <option value="fixed">Fixed</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#93c5fd' }}>x</label>
            <input
              type="range"
              min={0.3}
              max={2}
              step={0.1}
              value={scaleMultiplier}
              onChange={(e) => setScaleMultiplier(parseFloat(e.target.value))}
            />
            <span style={{ width: 34, textAlign: 'right', color: '#94a3b8' }}>{scaleMultiplier.toFixed(1)}x</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#93c5fd' }}>Zones</label>
            <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#93c5fd' }}>Infiltrations</label>
            <input type="checkbox" checked={showInfiltrations} onChange={(e) => setShowInfiltrations(e.target.checked)} />
          </div>
          <div style={{ width: 1, background: '#1f2937' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#93c5fd' }}>Flip X</label>
            <input type="checkbox" checked={flipX} onChange={(e) => setFlipX(e.target.checked)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#93c5fd' }}>Flip Z</label>
            <input type="checkbox" checked={flipZ} onChange={(e) => setFlipZ(e.target.checked)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#93c5fd' }}>Rotate</label>
            <select
              value={rotateDeg}
              onChange={(e) => setRotateDeg(parseInt(e.target.value, 10) as Rot)}
              style={{ background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 6, padding: '4px 6px' }}
            >
              <option value={-45}>-45°</option>
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#93c5fd' }}>Around center</label>
            <input type="checkbox" checked={rotateAroundCenter} onChange={(e) => setRotateAroundCenter(e.target.checked)} />
          </div>
          <div style={{ width: 1, background: '#1f2937' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setTopDownView(!topDownView)}
              style={{
                background: topDownView ? '#1f2937' : '#0b1220',
                color: '#e5e7eb',
                border: `1px solid ${topDownView ? '#374151' : '#1f2937'}`,
                borderRadius: 6,
                padding: '6px 12px',
                cursor: 'pointer',
                fontWeight: topDownView ? 600 : 400
              }}
            >
              {topDownView ? '✓ Top Down' : 'Top Down'}
            </button>
          </div>
        </div>
      </div>

      <aside style={{
        width: 400,
        borderLeft: '1px solid #1f2937',
        background: '#0f172a',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ padding: 14, borderBottom: '1px solid #1f2937' }}>
          <div style={{ marginBottom: 10 }}>
            {fullData && fullData.locations && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', color: '#93c5fd', fontSize: 13, marginBottom: 6 }}>
                  Location
                </label>
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0b1220',
                    color: '#e5e7eb',
                    border: '1px solid #1f2937',
                    borderRadius: 6,
                    padding: '6px 8px'
                  }}
                >
                  <option value="">-- Select Location --</option>
                  {Object.values(fullData.locations).map((loc) => (
                    <option key={loc.Id} value={loc.Id}>
                      {loc.Name || loc.Id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search BotZoneName or Id"
              style={{
                flex: 1,
                background: '#0b1220',
                color: '#e5e7eb',
                border: '1px solid #1f2937',
                borderRadius: 6,
                padding: '6px 8px'
              }}
            />
            <button
              onClick={() => { setSearch(''); }}
              style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 6, padding: '6px 10px' }}
            >
              Clear
            </button>
            <button
              onClick={() => { setShowPaste(true); setPasteText(''); setPasteError(null); }}
              style={{ background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 6, padding: '6px 10px' }}
            >
              Paste JSON
            </button>
            <button
              onClick={async () => { await loadDefault(); try { localStorage.removeItem('spawn_json_v1'); } catch {} }}
              style={{ background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 6, padding: '6px 10px' }}
            >
              Use default
            </button>
            <button
              onClick={() => setPinnedIndex(null)}
              style={{ background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }}
            >
              Unpin
            </button>
          </div>

          {selectedLocationId && (
            <div style={{ marginBottom: 10 }}>
              <Checkbox 
                label="Show inactive spawns" 
                checked={showInactiveSpawns} 
                onChange={(v) => setShowInactiveSpawns(v)}
              />
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                Inactive spawns are those whose BotZoneName is not in OpenZones
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Fieldset title="Categories">
              <Checkbox label="Boss" checked={categoryFilter.Boss} onChange={(v) => setCategoryFilter({ ...categoryFilter, Boss: v })} color="#ff5252" />
              <Checkbox label="Player" checked={categoryFilter.Player} onChange={(v) => setCategoryFilter({ ...categoryFilter, Player: v })} color="#4fc3f7" />
              <Checkbox label="Bot" checked={categoryFilter.Bot} onChange={(v) => setCategoryFilter({ ...categoryFilter, Bot: v })} color="#a5d6a7" />
              <Checkbox label="Other" checked={categoryFilter.Other} onChange={(v) => setCategoryFilter({ ...categoryFilter, Other: v })} color="#bdbdbd" />
            </Fieldset>

            <Fieldset title="Sides">
              {Object.keys(sideFilter).length === 0 && <div style={{ color: '#64748b', fontSize: 13 }}>(loading)</div>}
              {Object.entries(sideFilter).map(([k, v]) => (
                <Checkbox key={k} label={k} checked={v} onChange={(nv) => setSideFilter({ ...sideFilter, [k]: nv })} />
              ))}
            </Fieldset>
          </div>
        </div>

        <div style={{ padding: 14, overflowY: 'auto' }}>
          {showPaste && (
            <div style={{ marginBottom: 12, border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#0b1220' }}>
              <div style={{ color: '#93c5fd', marginBottom: 8 }}>Paste JSON (array or full data structure)</div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste SpawnPointParams array or full data structure with locations..."
                style={{ width: '100%', height: 200, background: '#0b1220', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 6, padding: 8 }}
              />
              {pasteError && <div style={{ color: '#fda4af', marginTop: 6 }}>{pasteError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => {
                    try {
                      const json = JSON.parse(pasteText);
                      
                      // Check if it's a full data structure
                      if (json.locations && typeof json.locations === 'object') {
                        setFullData(json as FullDataStructure);
                        setSelectedLocationId('');
                        setPasteError(null);
                        setShowPaste(false);
                        return;
                      }
                      
                      // Otherwise treat as array
                      if (!Array.isArray(json)) throw new Error('Root must be an array or object with locations');
                      setData(json as SpawnItem[]);
                      initFromData(json as SpawnItem[]);
                      setSelectedLocationId('');
                      setFullData(null);
                      try { localStorage.setItem('spawn_json_v1', JSON.stringify(json)); } catch {}
                      setPasteError(null);
                      setShowPaste(false);
                    } catch (err: any) {
                      setPasteError(err?.message || 'Invalid JSON');
                    }
                  }}
                  style={{ background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px' }}
                >
                  Load
                </button>
                <button
                  onClick={() => { setShowPaste(false); setPasteError(null); }}
                  style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 6, padding: '6px 10px' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <h2 style={{ margin: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
            {selectedItem ? 'Spawn details' : 'Hover or click to pin'}
          </h2>

          {!selectedItem && (
            <div style={{ color: '#94a3b8', fontSize: 14 }}>
              - Hover a sphere to preview
              <br />
              - Click a sphere to pin details
              <br />
              - Use filters/search above
              <div style={{ marginTop: 12 }}>
                <Legend />
              </div>
            </div>
          )}

          {selectedItem && (
            <Details item={selectedItem} />
          )}
        </div>
      </aside>
    </div>
  );
}

function Fieldset(props: { title: string; children: any }) {
  return (
    <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10 }}>
      <div style={{ color: '#93c5fd', fontSize: 13, marginBottom: 6 }}>{props.title}</div>
      <div style={{ display: 'grid', gap: 6 }}>{props.children}</div>
    </div>
  );
}

function Checkbox(props: { label: string; checked: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span style={{ width: 12, height: 12, borderRadius: 999, background: props.color || '#64748b' }} />
      <span>{props.label}</span>
    </label>
  );
}

function Details({ item }: { item: SpawnItem }) {
  const rows: Array<[string, string | number | string[]]> = [
    ['Id', item.Id],
    ['BotZoneName', item.BotZoneName || '(none)'],
    ['Categories', item.Categories?.join(', ') || '(none)'],
    ['Sides', item.Sides?.join(', ') || '(none)'],
    ['Infiltration', item.Infiltration || '(empty)'],
    ['CorePointId', item.CorePointId],
    ['DelayToCanSpawnSec', item.DelayToCanSpawnSec],
    ['Rotation', item.Rotation],
    ['Position', `${fmt(item.Position.x)}, ${fmt(item.Position.y)}, ${fmt(item.Position.z)}`],
    ['Collider _parent', item.ColliderParams?._parent ?? '(none)'],
    ['Collider Center', item.ColliderParams?._props?.Center ? `${fmt(item.ColliderParams._props.Center.x)}, ${fmt(item.ColliderParams._props.Center.y)}, ${fmt(item.ColliderParams._props.Center.z)}` : '(none)'],
    ['Collider Radius', item.ColliderParams?._props?.Radius ?? '(none)'],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 13 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <div style={{ color: '#93c5fd' }}>{k}</div>
          <div style={{ color: '#e5e7eb', wordBreak: 'break-word' }}>
            {Array.isArray(v) ? v.join(', ') : String(v)}
          </div>
        </div>
      ))}
      <div style={{ gridColumn: '1 / -1', marginTop: 12 }}>
        <Legend />
      </div>
    </div>
  );
}

function Legend() {
  const item = (c: string, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 12, height: 12, background: c, borderRadius: 999 }} />
      <span>{label}</span>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 6, color: '#94a3b8', fontSize: 13 }}>
      {item('#ff5252', 'Boss')}
      {item('#4fc3f7', 'Player')}
      {item('#a5d6a7', 'Bot')}
      {item('#bdbdbd', 'Other')}
    </div>
  );
}

// Andrew's monotone chain convex hull on XZ plane
function convexHull2D(points: Array<[number, number]>): Array<[number, number]> {
  const P = points.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (P.length <= 1) return P;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of P) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}