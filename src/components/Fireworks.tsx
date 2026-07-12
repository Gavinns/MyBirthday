import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MathUtils,
  PointsMaterial,
  Vector3,
} from "three";

type FireworksProps = {
  isActive: boolean;
  origin?: [number, number, number];
};

const FIREWORK_COUNT = 100;
const PARTICLES_PER_FIREWORK = 10;
const TOTAL_PARTICLES = FIREWORK_COUNT * PARTICLES_PER_FIREWORK;
const GRAVITY = -4;

type FireworkData = {
  positions: Float32Array;
  velocities: Float32Array;
  origins: Float32Array;
  baseColors: Float32Array;
  colors: Float32Array;
  ages: Float32Array;
  lifetimes: Float32Array;
};

const randomColor = () => {
  const hue = Math.random();
  const color = new Color().setHSL(hue, 0.65 + Math.random() * 0.2, 0.6);
  return color;
};

export function Fireworks({ isActive, origin = [0, 5, -14] }: FireworksProps) {
  const geometryRef = useRef<BufferGeometry>(null);
  const materialRef = useRef<PointsMaterial>(null);
  const dataRef = useRef<FireworkData | null>(null);
  const baseOrigin = useMemo(() => new Vector3(...origin), [origin]);

  if (!dataRef.current) {
    dataRef.current = {
      positions: new Float32Array(TOTAL_PARTICLES * 3),
      velocities: new Float32Array(TOTAL_PARTICLES * 3),
      origins: new Float32Array(TOTAL_PARTICLES * 3),
      baseColors: new Float32Array(TOTAL_PARTICLES * 3),
      colors: new Float32Array(TOTAL_PARTICLES * 3),
      ages: new Float32Array(TOTAL_PARTICLES),
      lifetimes: new Float32Array(TOTAL_PARTICLES),
    };
  }

  const resetParticle = (index: number) => {
    const {
      positions,
      velocities,
      origins,
      baseColors,
      colors,
      ages,
      lifetimes,
    } = dataRef.current!;

    const baseIndex = index * 3;
    const burstOrigin = baseOrigin
      .clone()
      .add(new Vector3((Math.random() - 0.5) * 1000, Math.random() * 200, (Math.random() - 0.5) * 1000));

    origins[baseIndex] = burstOrigin.x;
    origins[baseIndex + 1] = burstOrigin.y;
    origins[baseIndex + 2] = burstOrigin.z;

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1)* 0.9;
    const speed = 1 + Math.random() * 1.4;

    velocities[baseIndex] = Math.sin(phi) * Math.cos(theta) * speed;
    velocities[baseIndex + 1] = Math.cos(phi) * (speed * 1.2);
    velocities[baseIndex + 2] = Math.sin(phi) * Math.sin(theta) * speed;

    const color = randomColor();
    baseColors[baseIndex] = color.r;
    baseColors[baseIndex + 1] = color.g;
    baseColors[baseIndex + 2] = color.b;

    colors[baseIndex] = 0;
    colors[baseIndex + 1] = 0;
    colors[baseIndex + 2] = 0;

    positions[baseIndex] = burstOrigin.x;
    positions[baseIndex + 1] = burstOrigin.y;
    positions[baseIndex + 2] = burstOrigin.z;

    lifetimes[index] = 1.6 + Math.random() * 1.3;
    ages[index] = -Math.random() * 1.2;
  };

  useEffect(() => {
    for (let i = 0; i < TOTAL_PARTICLES; i += 1) {
      resetParticle(i);
    }
  }, []);

  useFrame((_, delta) => {
    const geometry = geometryRef.current;
    const material = materialRef.current;
    const data = dataRef.current;

    if (!geometry || !material || !data) {
      return;
    }

    const { positions, velocities, origins, colors, baseColors, ages, lifetimes } =
      data;
    const positionAttr = geometry.getAttribute("position") as BufferAttribute;
    const colorAttr = geometry.getAttribute("color") as BufferAttribute;

    if (!isActive) {
      material.opacity = MathUtils.damp(material.opacity, 0, 5, delta);
      return;
    }

    material.opacity = MathUtils.damp(material.opacity, 0.85, 2.5, delta);

    for (let i = 0; i < TOTAL_PARTICLES; i += 1) {
      const idx3 = i * 3;
      ages[i] += delta;

      if (ages[i] < 0) {
        positions[idx3] = origins[idx3];
        positions[idx3 + 1] = origins[idx3 + 1];
        positions[idx3 + 2] = origins[idx3 + 2];
        colors[idx3] = 0;
        colors[idx3 + 1] = 0;
        colors[idx3 + 2] = 0;
        continue;
      }

      if (ages[i] > lifetimes[i] || positions[idx3 + 1] < baseOrigin.y - 1.5) {
        resetParticle(i);
        continue;
      }

      const age = ages[i];

      positions[idx3] =
        origins[idx3] + velocities[idx3] * age;
      positions[idx3 + 1] =
        origins[idx3 + 1] + velocities[idx3 + 1] * age + 0.5 * GRAVITY * age * age;
      positions[idx3 + 2] =
        origins[idx3 + 2] + velocities[idx3 + 2] * age;

      const fade = Math.max(0, 1 - age / lifetimes[i]);
      colors[idx3] = baseColors[idx3] * fade;
      colors[idx3 + 1] = baseColors[idx3 + 1] * fade;
      colors[idx3 + 2] = baseColors[idx3 + 2] * fade;
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return (
    <group>
      <points frustumCulled={false}>
        <bufferGeometry ref={geometryRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[dataRef.current.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[dataRef.current.colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          size={1}
          transparent
          vertexColors
          depthWrite={false}
          opacity={0}
          sizeAttenuation
        />
      </points>
    </group>
  );
}
