import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useDashboardStore, type FileData } from '../store/useDashboardStore';

interface CommitNodeProps {
  id: number;
  position: [number, number, number];
  file: FileData;
}

export function CommitNode({ id, position, file }: CommitNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  const [hovered, setHovered] = useState(false);
  
  const activeNodeId = useDashboardStore((state) => state.activeNodeId);
  const setActiveNodeId = useDashboardStore((state) => state.setActiveNodeId);

  const isActive = activeNodeId === id;

  // Compute node color based on state
  let nodeColor = '#6366f1'; // Indigo (queued)
  let emissiveColor = '#4f46e5';
  
  if (file.status === 'scanning') {
    nodeColor = '#3b82f6'; // Blue
    emissiveColor = '#06b6d4';
  } else if (file.status === 'complete') {
    const hasFindings = file.findings.length > 0;
    const hasCritical = file.findings.some(f => f.severity === 'critical');
    
    if (hasFindings) {
      nodeColor = hasCritical ? '#dc2626' : '#f97316'; // Red or Orange
      emissiveColor = hasCritical ? '#ef4444' : '#fb923c';
    } else {
      nodeColor = '#22c55e'; // Green
      emissiveColor = '#4ade80';
    }
  }

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    
    if (meshRef.current) {
      // 1. Smooth Scale Lerp
      let baseScale = 0.8;
      if (isActive) baseScale = 1.35;
      else if (hovered) baseScale = 1.15;
      
      // Add a subtle breathing animation if scanning
      if (file.status === 'scanning') {
        baseScale += Math.sin(t * 8) * 0.05;
      }
      
      const scaleVec = new THREE.Vector3(baseScale, baseScale, baseScale);
      meshRef.current.scale.lerp(scaleVec, 0.12);

      // 2. Mesh Rotation
      meshRef.current.rotation.y += 0.01;
      meshRef.current.rotation.x += 0.005;

      // 3. Emissive Intensity Lerp (Glow level)
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      if (mat) {
        let targetIntensity = 0.3;
        if (isActive) targetIntensity = 2.5;
        else if (hovered) targetIntensity = 1.6;
        else if (file.status === 'scanning') {
          // Pulse the glow for scanning nodes
          targetIntensity = 1.0 + Math.sin(t * 8) * 0.6;
        }
        
        mat.emissiveIntensity = THREE.MathUtils.lerp(
          mat.emissiveIntensity,
          targetIntensity,
          0.1
        );
      }
    }

    if (glowRef.current) {
      // Rotate glow shell in opposite direction
      glowRef.current.rotation.y -= 0.005;
      
      // Make glow shell breath in and out
      const pulse = 1.15 + Math.sin(t * 3) * 0.08;
      let targetGlowScale = pulse;
      if (isActive) targetGlowScale = pulse * 1.3;
      else if (hovered) targetGlowScale = pulse * 1.15;
      
      glowRef.current.scale.lerp(new THREE.Vector3(targetGlowScale, targetGlowScale, targetGlowScale), 0.1);

      // Adjust glow opacity
      const glowMat = glowRef.current.material as THREE.MeshBasicMaterial;
      if (glowMat) {
        let targetOpacity = 0.15;
        if (isActive) targetOpacity = 0.45;
        else if (hovered) targetOpacity = 0.35;
        else if (file.status === 'scanning') {
          targetOpacity = 0.25 + Math.sin(t * 8) * 0.15;
        }
        glowMat.opacity = THREE.MathUtils.lerp(glowMat.opacity, targetOpacity, 0.1);
      }
    }
  });

  // Extract file basename for cleaner display
  const fileBasename = file.name.split('/').pop() || file.name;

  return (
    <group position={position}>
      {/* Outer Glow Ambient Shell */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.7, 32, 32]} />
        <meshBasicMaterial
          color={emissiveColor}
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Main Node Mesh */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          setActiveNodeId(isActive ? null : id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          useDashboardStore.setState({ hoveredNodeId: id });
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          useDashboardStore.setState({ hoveredNodeId: null });
        }}
      >
        <sphereGeometry args={[0.5, 64, 64]} />
        <meshStandardMaterial
          color={nodeColor}
          emissive={emissiveColor}
          emissiveIntensity={0.3}
          roughness={0.1}
          metalness={0.9}
        />
      </mesh>

      {/* 3D WebGL Label Floating Above Node */}
      <Text
        position={[0, 0.85, 0]}
        fontSize={0.25}
        color={isActive ? '#ffffff' : hovered ? '#cbd5e1' : '#94a3b8'}
        font="/dashboard/fonts/consola.ttf"
        anchorX="center"
        anchorY="middle"
      >
        {fileBasename}
      </Text>

      {/* 3D HTML Tooltip when Hovered or Active */}
      {(hovered || isActive) && (
        <Html distanceFactor={8} position={[0, -0.9, 0]} center pointerEvents="none">
          <div className="flex flex-col bg-slate-950/95 border border-slate-800 p-2.5 rounded-lg shadow-2xl backdrop-blur-md min-w-[200px] text-xs transition-all duration-300 transform scale-95 opacity-100">
            <div className="font-mono font-semibold text-slate-200 truncate">{file.name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  file.status === 'complete'
                    ? file.findings.length > 0
                      ? 'bg-orange-500'
                      : 'bg-green-500'
                    : 'bg-blue-500 animate-pulse'
                }`}
              />
              <span className="text-slate-400 capitalize text-[10px]">
                {file.status === 'complete'
                  ? `${file.findings.length} findings`
                  : file.status}
              </span>
            </div>
            {file.findings.length > 0 && file.status === 'complete' && (
              <div className="mt-1.5 border-t border-slate-800/80 pt-1 text-[10px] text-red-400 font-medium">
                ⚠️ Critical Issue Detected
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
