import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function ParticleWave() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 45; // 45x45 grid = 2025 particles
  const spacing = 0.45;

  // Pre-calculate positions
  const positions = useMemo(() => {
    const pos = new Float32Array(count * count * 3);
    let i = 0;
    for (let x = 0; x < count; x++) {
      for (let z = 0; z < count; z++) {
        // Center the grid
        const posX = (x - count / 2) * spacing;
        const posZ = (z - count / 2) * spacing;
        
        pos[i] = posX;
        pos[i + 1] = 0; // Y axis starts at 0
        pos[i + 2] = posZ;
        
        i += 3;
      }
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (pointsRef.current) {
      const geometry = pointsRef.current.geometry;
      const positionsAttr = geometry.attributes.position;
      if (!positionsAttr) return;

      const t = state.clock.getElapsedTime();
      const pointer = state.pointer; // Mouse position in normalized device coordinates [-1, 1]

      // Map normalized pointer coordinates [-1, 1] to approximate world units
      const mouseX = pointer.x * 9;
      const mouseZ = -pointer.y * 9; // Invert Y for Z coordinate mapping in 3D

      let idx = 0;
      for (let x = 0; x < count; x++) {
        for (let z = 0; z < count; z++) {
          const posX = positionsAttr.getX(idx);
          const posZ = positionsAttr.getZ(idx);

          // Calculate height using double sine/cosine wave algorithms for organic motion
          let y = Math.sin(posX * 0.35 + t * 0.7) * Math.cos(posZ * 0.35 + t * 0.7) * 0.55;
          
          // Add secondary ripples
          y += Math.sin(posX * 0.15 - t * 0.3) * 0.2;

          // Mouse hover displacement (force field ripple effect)
          const dx = posX - mouseX;
          const dz = posZ - mouseZ;
          const dist = Math.sqrt(dx * dx + dz * dz);
          
          if (dist < 4.5) {
            // Push points upward/downward based on proximity to cursor
            const force = (1.0 - dist / 4.5) ** 1.8;
            y += force * 0.95;
          }

          positionsAttr.setY(idx, y);
          idx++;
        }
      }
      positionsAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef} position={[0, -2.2, 0]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#818cf8" // Premium neon indigo/slate point color
        size={0.065}
        sizeAttenuation
        transparent
        opacity={0.35}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
