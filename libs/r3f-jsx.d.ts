// Minimal JSX intrinsic element declarations to satisfy TypeScript when
// React Three Fiber type augmentation isn't being picked up by the tooling.
// These are intentionally broad (any) to avoid fighting editor/CI configs.

declare global {
	namespace JSX {
		interface IntrinsicElements {
			color: any;
			hemisphereLight: any;
			directionalLight: any;
			sphereGeometry: any;
			meshStandardMaterial: any;
			axesHelper: any;
		}
	}
}

export {};


