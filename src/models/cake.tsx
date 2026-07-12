import { useLoader } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";
import { useMemo } from "react";
import type { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type CakeProps = ThreeElements["group"];

export function Cake({ children, ...groupProps }: CakeProps) {
  const gltf = useLoader(GLTFLoader, "/cake.glb");
  const cakeScene = useMemo<Group | null>(() => gltf.scene?.clone(true) ?? null, [gltf.scene]);

  if (!cakeScene) {
    return null;
  }

  return (
    <group {...groupProps}>
      <primitive object={cakeScene} />
      {children}
    </group>
  );
}
