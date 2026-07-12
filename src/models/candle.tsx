import { useFrame, useLoader } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group, Mesh, PointLight } from "three";
import { DoubleSide, MathUtils, ShaderMaterial } from "three";
import type { IUniform } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type CandleProps = ThreeElements["group"] & {
  isLit?: boolean;
};

type FlameUniforms = {
  time: IUniform<number>;
  strength: IUniform<number>;
};

const vertexShader = `
  uniform float time;
  varying vec2 vUv;
  varying float hValue;

  float random (in vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  float noise (in vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    pos *= vec3(0.8, 2.0, 0.725);
    hValue = position.y;
    float posXZlen = length(position.xz);

    pos.y *= 1.0 + (cos((posXZlen + 0.25) * 3.1415926) * 0.4 + noise(vec2(0.0, time)) * 0.3 + noise(vec2(position.x + time, position.z + time)) * 0.8) * position.y;
    pos.x += noise(vec2(time * 2.0, (position.y - time) * 4.0)) * hValue * 0.15;
    pos.z += noise(vec2((position.y - time) * 4.0, time * 2.0)) * hValue * 0.15;
    pos.x += sin(time * 1.5 + position.y * 2.0) * hValue * 0.08;
    pos.z += cos(time * 1.3 + position.y * 2.0) * hValue * 0.08;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform float strength;
  varying float hValue;
  varying vec2 vUv;

  vec3 heatmapGradient(float t) {
    return clamp(
      (pow(t, 1.5) * 0.8 + 0.2) *
        vec3(
          smoothstep(0.0, 0.35, t) + t * 0.5,
          smoothstep(0.5, 1.0, t),
          max(1.0 - t * 1.7, t * 7.0 - 6.0)
        ),
      0.0,
      1.0
    );
  }

  void main() {
    float v = abs(smoothstep(0.0, 0.4, hValue) - 1.0);
    float alpha = (1.0 - v) * 0.99;
    alpha -= 1.0 - smoothstep(1.0, 0.97, hValue);
    gl_FragColor = vec4(heatmapGradient(smoothstep(0.0, 0.3, hValue)) * vec3(0.95, 0.95, 0.4), alpha);
    gl_FragColor.rgb = mix(vec3(0.0, 0.0, 1.0), gl_FragColor.rgb, smoothstep(0.0, 0.3, hValue));
    gl_FragColor.rgb += vec3(1.0, 0.9, 0.5) * (1.25 - vUv.y);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.66, 0.32, 0.03), smoothstep(0.95, 1.0, hValue));
    gl_FragColor *= strength;
  }
`;

export function Candle({ children, isLit = true, ...groupProps }: CandleProps) {
  const gltf = useLoader(GLTFLoader, "/candle.glb");
  const candleScene = useMemo<Group | null>(() => gltf.scene?.clone(true) ?? null, [gltf.scene]);
  const lightRef = useRef<PointLight>(null);
  const flameMeshRef = useRef<Mesh>(null);
  const lightStrengthRef = useRef(isLit ? 1 : 0);

  const flameUniforms = useMemo<FlameUniforms>(
    () => ({
      time: { value: 0 },
      strength: { value: 1 },
    }),
    []
  );

  const flameMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: flameUniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        side: DoubleSide,
      }),
    [flameUniforms]
  );

  useEffect(() => {
    return () => {
      flameMaterial.dispose();
    };
  }, [flameMaterial]);

  useEffect(() => {
    flameUniforms.strength.value = isLit ? 1 : 0;
    lightStrengthRef.current = isLit ? 1 : 0;
  }, [isLit, flameUniforms]);

  useFrame(({ clock }, delta) => {
    const elapsed = clock.elapsedTime;
    flameUniforms.time.value = elapsed;
    const targetStrength = isLit ? 1 : 0;
    flameUniforms.strength.value = MathUtils.damp(
      flameUniforms.strength.value,
      targetStrength,
      4,
      delta
    );

    const light = lightRef.current;
    if (!light) {
      return;
    }
    lightStrengthRef.current = MathUtils.damp(
      lightStrengthRef.current,
      targetStrength,
      4,
      delta
    );

    const flicker =
      Math.sin(elapsed * 10.0) * 0.08 +
      Math.sin(elapsed * 15.3) * 0.04 +
      Math.sin(elapsed * 8.7) * 0.03;

    const strength = flameUniforms.strength.value;
    light.intensity = Math.max(0, lightStrengthRef.current + flicker * strength * 0.5);
    light.position.y = 3.5 + Math.sin(elapsed * 5.0) * 0.1;
    light.position.x = Math.sin(elapsed * 3.0) * 0.05;
    light.position.z = Math.cos(elapsed * 2.7) * 0.05;
    light.visible = strength > 0.02;
    if (flameMeshRef.current) {
      flameMeshRef.current.visible = strength > 0.02;
    }
  });

  if (!candleScene) {
    return null;
  }

  return (
    <group {...groupProps}>
      <primitive object={candleScene} />
      <mesh ref={flameMeshRef} scale={0.4} position={[0, 2.9, 0]} material={flameMaterial}>
        <sphereGeometry args={[0.5, 32, 32]} />
      </mesh>
      <pointLight ref={lightRef} distance={5} color="#ffffffff" decay={1} />
      {children}
    </group>
  );
}
