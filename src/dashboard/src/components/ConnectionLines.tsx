import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useDashboardStore } from '../store/useDashboardStore';

interface PacketProps {
  curve: THREE.QuadraticBezierCurve3;
  color: string;
  speed: number;
  delayOffset: number;
}

// Glowing data packet travelling along the connection line
function DataPacket({ curve, color, speed, delayOffset }: PacketProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const t = ((state.clock.getElapsedTime() * speed) + delayOffset) % 1.0;
      const point = curve.getPointAt(t);
      meshRef.current.position.copy(point);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.06, 12, 12]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

export function ConnectionLines() {
  const files = useDashboardStore((state) => state.files);
  const running = useDashboardStore((state) => state.running);
  const activeNodeId = useDashboardStore((state) => state.activeNodeId);

  // Generate connection curves between sequential nodes and back to start
  const connections = useMemo(() => {
    if (files.length === 0) return [];

    const curvesList: {
      curve: THREE.QuadraticBezierCurve3;
      points: THREE.Vector3[];
      id: string;
      color: string;
    }[] = [];

    // Central Engine Node Position
    const centerPos = new THREE.Vector3(0, 0, 0);

    files.forEach((file, index) => {
      if (!file || !file.name) return;
      // Current node coordinates
      const angle = (index / files.length) * Math.PI * 2;
      const x = Math.cos(angle) * 4;
      const z = Math.sin(angle) * 4;
      const y = Math.sin(index * 2) * 0.8;
      const nodePos = new THREE.Vector3(x, y, z);

      // Next node coordinates
      const nextIndex = (index + 1) % files.length;
      const nextAngle = (nextIndex / files.length) * Math.PI * 2;
      const nextX = Math.cos(nextAngle) * 4;
      const nextZ = Math.sin(nextAngle) * 4;
      const nextY = Math.sin(nextIndex * 2) * 0.8;
      const nextNodePos = new THREE.Vector3(nextX, nextY, nextZ);

      // 1. Ring curve connecting node to next node
      const midPointRing = new THREE.Vector3()
        .addVectors(nodePos, nextNodePos)
        .multiplyScalar(0.5);
      
      // Push midpoint outwards away from center to create a nice curve
      const dirOut = midPointRing.clone().normalize().multiplyScalar(0.6);
      midPointRing.add(dirOut).add(new THREE.Vector3(0, 0.4, 0));

      const ringCurve = new THREE.QuadraticBezierCurve3(nodePos, midPointRing, nextNodePos);
      const ringPoints = ringCurve.getPoints(24);

      // Determine ring connection color
      let ringColor = '#1e1b4b'; // Dull purple (queued)
      if (file.status === 'scanning') {
        ringColor = '#0284c7'; // Glowing blue
      } else if (file.status === 'complete') {
        ringColor = file.findings.length > 0 ? '#ea580c' : '#16a34a'; // Orange/Green
      }

      curvesList.push({
        curve: ringCurve,
        points: ringPoints,
        id: `ring-${index}`,
        color: ringColor,
      });

      // 2. Core curve connecting node to the center core
      const midPointCore = new THREE.Vector3()
        .addVectors(nodePos, centerPos)
        .multiplyScalar(0.5)
        .add(new THREE.Vector3(0, 0.5, 0)); // arch up

      const coreCurve = new THREE.QuadraticBezierCurve3(nodePos, midPointCore, centerPos);
      const corePoints = coreCurve.getPoints(16);

      // Core connection lines are thinner and flow into the engine
      curvesList.push({
        curve: coreCurve,
        points: corePoints,
        id: `core-${index}`,
        color: file.status === 'scanning' ? '#38bdf8' : '#2e1065',
      });
    });

    return curvesList;
  }, [files]);

  return (
    <group>
      {/* Central Engine Visual Core (Glowing Purple Sphere) */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color="#a855f7" toneMapped={false} />
      </mesh>
      
      {/* Outer Central Glow Shell */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.6, 16, 16]} />
        <meshBasicMaterial
          color="#a855f7"
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Render the connection lines */}
      {connections.map((c) => (
        <Line
          key={c.id}
          points={c.points}
          color={c.color}
          lineWidth={c.id.startsWith('ring') ? 1.4 : 0.8}
          transparent
          opacity={activeNodeId !== null ? 0.25 : 0.65}
        />
      ))}

      {/* Render animated data packets along active scanning routes */}
      {running &&
        connections
          .filter((c) => c.color !== '#1e1b4b' && c.color !== '#2e1065')
          .map((c) => (
            <group key={`packets-${c.id}`}>
              <DataPacket
                curve={c.curve}
                color={c.color === '#ea580c' || c.color === '#fb923c' ? '#f97316' : '#60a5fa'}
                speed={0.4}
                delayOffset={0}
              />
              <DataPacket
                curve={c.curve}
                color={c.color === '#16a34a' ? '#22c55e' : '#a855f7'}
                speed={0.4}
                delayOffset={0.5}
              />
            </group>
          ))}
    </group>
  );
}
