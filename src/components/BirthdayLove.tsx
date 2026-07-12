import { useLoader } from "@react-three/fiber";
import type { ThreeElements, ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useCursor, useTexture } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  Box3,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
  DoubleSide,
  Group,
  Euler,
  Quaternion,
} from "three";

type BirthdayLoveProps = Omit<ThreeElements["group"], "id"> & {
  id: string;
  image: string;
  imageScale?: number | [number, number];
  imageOffset?: [number, number, number];
  imageInset?: number;
  tablePosition: [number, number, number];
  tableRotation: [number, number, number];
  isActive: boolean;
  onToggle: (id: string) => void;
};

const DEFAULT_IMAGE_SCALE: [number, number] = [0.82, 0.82];
const CAMERA_DISTANCE = 1.5;
const CAMERA_Y_FLOOR = 0.8;
const HOVER_LIFT = 0.05;

export function BirthdayLove({
  id,
  image,
  imageScale = DEFAULT_IMAGE_SCALE,
  imageOffset,
  imageInset = 0.01,
  tablePosition,
  tableRotation,
  isActive,
  onToggle,
  children,
  ...groupProps
}: BirthdayLoveProps) {
  const groupRef = useRef<Group>(null);
  const { gl, camera } = useThree();
  const [isHovered, setIsHovered] = useState(false);

  useCursor(isHovered || isActive, "pointer");

  const gltf = useLoader(GLTFLoader, "/picture_frame.glb");
  const pictureTexture = useTexture(image);

  pictureTexture.colorSpace = SRGBColorSpace;
  const maxAnisotropy =
    typeof gl.capabilities.getMaxAnisotropy === "function"
      ? gl.capabilities.getMaxAnisotropy()
      : 1;
  pictureTexture.anisotropy = maxAnisotropy;

  const frameScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const { frameSize, frameCenter } = useMemo(() => {
    const box = new Box3().setFromObject(frameScene);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { frameSize: size, frameCenter: center };
  }, [frameScene]);

  const scaledImage = useMemo<[number, number]>(() => {
    if (Array.isArray(imageScale)) return imageScale;
    return [imageScale, imageScale];
  }, [imageScale]);

  const [imageScaleX, imageScaleY] = scaledImage;
  const imageWidth = frameSize.x * imageScaleX;
  const imageHeight = frameSize.y * imageScaleY;
  const [offsetX, offsetY, offsetZ] = imageOffset ?? [0, 0.05, -0.27];
  const imagePosition: [number, number, number] = [
    frameCenter.x + offsetX,
    frameCenter.y + offsetY,
    frameCenter.z + offsetZ,
  ];

  const pictureMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: pictureTexture,
        roughness: 0.08,
        metalness: 0,
        side: DoubleSide,
      }),
    [pictureTexture]
  );

  const defaultPosition = useMemo(
    () => new Vector3(...tablePosition),
    [tablePosition]
  );

  const defaultQuaternion = useMemo(() => {
    const euler = new Euler(...tableRotation);
    return new Quaternion().setFromEuler(euler);
  }, [tableRotation]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.copy(defaultPosition);
    group.quaternion.copy(defaultQuaternion);
  }, [defaultPosition, defaultQuaternion]);

  useEffect(() => {
    if (!isActive) setIsHovered(false);
  }, [isActive]);

  useEffect(() => {
    return () => { pictureMaterial.dispose(); };
  }, [pictureMaterial]);

  // Reusable temp objects
  const tmpPosition  = useMemo(() => new Vector3(), []);
  const tmpQuaternion = useMemo(() => new Quaternion(), []);
  const tmpDirection = useMemo(() => new Vector3(), []);

  const cameraOffset = useMemo(() => new Vector3(0, -0.1, 0), []);
  const flipY  = useMemo(() => new Quaternion().setFromEuler(new Euler(0, Math.PI, 0)), []);
  const tiltDown = useMemo(() => new Quaternion().setFromEuler(new Euler(-0.4, 0, 0)), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (isActive) {
      // ── Position: float in front of camera ──
      const camDir = tmpDirection.copy(camera.getWorldDirection(tmpDirection));
      tmpPosition
        .copy(camera.position)
        .addScaledVector(camDir, CAMERA_DISTANCE)
        .add(cameraOffset);
      if (tmpPosition.y < CAMERA_Y_FLOOR) tmpPosition.y = CAMERA_Y_FLOOR;

      // ── Rotation: copy camera quaternion so frame faces same direction as camera ──
      // Then multiply flipY so the FRONT of the frame faces the camera (not the back)
      tmpQuaternion.copy(camera.quaternion).multiply(flipY).multiply(tiltDown);

      // Smooth interpolation
      const posAlpha = 1 - Math.exp(-delta * 12);
      const rotAlpha = 1 - Math.exp(-delta * 10);
      group.position.lerp(tmpPosition, posAlpha);
      group.quaternion.slerp(tmpQuaternion, rotAlpha);

    } else {
      // ── Return to table pose ──
      const targetPos = tmpPosition.copy(defaultPosition);
      if (isHovered) targetPos.y += HOVER_LIFT;

      const posAlpha = 1 - Math.exp(-delta * 12);
      const rotAlpha = 1 - Math.exp(-delta * 10);
      group.position.lerp(targetPos, posAlpha);
      group.quaternion.slerp(defaultQuaternion, rotAlpha);
    }
  });

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (!isActive) setIsHovered(true);
    },
    [isActive]
  );

  const handlePointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setIsHovered(false);
  }, []);

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
  }, []);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onToggle(id);
    },
    [id, onToggle]
  );

  return (
    <group ref={groupRef} {...groupProps}>
      <group>
        <primitive object={frameScene} />
        <mesh
          position={imagePosition}
          rotation={[0.435, Math.PI, 0]}
          material={pictureMaterial}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
        >
          <planeGeometry args={[imageWidth, imageHeight]} />
        </mesh>
        {children}
      </group>
    </group>
  );
}