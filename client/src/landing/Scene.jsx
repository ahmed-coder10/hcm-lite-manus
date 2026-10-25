import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

/** Slow mouse-follow rig: the whole scene leans toward the pointer. */
function Rig({ children, intensity = 0.28 }) {
  const group = useRef();
  useFrame((state, delta) => {
    if (!group.current) return;
    const { x, y } = state.pointer;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, x * intensity, 3.2, delta);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -y * intensity * 0.7, 3.2, delta);
  });
  return <group ref={group}>{children}</group>;
}

/** The hero object: a distorted glass icosahedron inside a wireframe shell. */
function Core() {
  const inner = useRef();
  useFrame((state) => {
    if (!inner.current) return;
    inner.current.rotation.z = state.clock.elapsedTime * 0.06;
  });

  return (
    <Float speed={1.5} rotationIntensity={0.45} floatIntensity={1.2}>
      <group>
        <mesh ref={inner}>
          <icosahedronGeometry args={[1.62, 6]} />
          <MeshDistortMaterial
            color="#4B2FD6"
            emissive="#2A1B7A"
            emissiveIntensity={0.55}
            roughness={0.12}
            metalness={0.72}
            distort={0.34}
            speed={1.5}
          />
        </mesh>

        <mesh scale={2.05} rotation={[0.4, 0.2, 0.1]}>
          <icosahedronGeometry args={[1.6, 1]} />
          <meshBasicMaterial color="#22D3EE" wireframe transparent opacity={0.16} />
        </mesh>

        <mesh scale={2.55} rotation={[-0.3, 0.6, 0.4]}>
          <torusGeometry args={[1, 0.006, 8, 160]} />
          <meshBasicMaterial color="#A78BFA" transparent opacity={0.55} />
        </mesh>
        <mesh scale={2.9} rotation={[0.9, -0.4, 0.2]}>
          <torusGeometry args={[1, 0.004, 8, 160]} />
          <meshBasicMaterial color="#22D3EE" transparent opacity={0.35} />
        </mesh>
      </group>
    </Float>
  );
}

/** Three small satellites orbiting on tilted rings. */
function Satellites() {
  const group = useRef();
  useFrame((state) => {
    if (group.current) group.current.rotation.y = state.clock.elapsedTime * 0.22;
  });
  const nodes = useMemo(
    () => [
      { radius: 2.5, angle: 0.0, y: 0.55, size: 0.085, color: '#22D3EE' },
      { radius: 3.0, angle: 2.1, y: -0.35, size: 0.06, color: '#FFB86B' },
      { radius: 2.2, angle: 4.0, y: 1.0, size: 0.05, color: '#7C5CFF' },
    ],
    [],
  );
  return (
    <group ref={group}>
      {nodes.map((n, i) => (
        <mesh key={i} position={[Math.cos(n.angle) * n.radius, n.y, Math.sin(n.angle) * n.radius]}>
          <sphereGeometry args={[n.size, 24, 24]} />
          <meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function HeroScene({ className }) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.2, 6.6], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 7, 5]} intensity={1.7} color="#C4B5FD" />
        <pointLight position={[-6, -3, 3]} intensity={22} color="#22D3EE" distance={18} />
        <pointLight position={[5, -4, -4]} intensity={14} color="#7C5CFF" distance={16} />

        <Rig>
          <Core />
          <Satellites />
        </Rig>

        <Sparkles count={70} scale={9} size={2.4} speed={0.35} color="#A78BFA" opacity={0.7} />
        <Suspense fallback={null}>
          <fog attach="fog" args={['#05060B', 12, 22]} />
        </Suspense>
      </Canvas>
    </div>
  );
}
