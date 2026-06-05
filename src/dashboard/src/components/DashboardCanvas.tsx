import { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useDashboardStore } from '../store/useDashboardStore';
import { CommitNode } from './CommitNode';
import { ConnectionLines } from './ConnectionLines';
import { ParticleWave } from './ParticleWave';

// Camera controller to smoothly pan/zoom onto the selected node
function CameraController() {
  const { camera, controls } = useThree();
  const activeNodeId = useDashboardStore((state) => state.activeNodeId);
  const files = useDashboardStore((state) => state.files);
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const targetCamPos = useRef(new THREE.Vector3(0, 5, 12));

  useEffect(() => {
    if (activeNodeId !== null && files[activeNodeId]) {
      // Calculate selected node position
      const angle = (activeNodeId / files.length) * Math.PI * 2;
      const x = Math.cos(angle) * 4;
      const z = Math.sin(angle) * 4;
      const y = Math.sin(activeNodeId * 2) * 0.8;

      // Gentle camera focus shift (moves 30% toward active node, camera stays ~10 units away)
      targetLookAt.current.set(x * 0.35, y * 0.35, z * 0.35);
      targetCamPos.current.set(x * 0.5, 5 + y * 0.2, 10 + z * 0.5);
    } else {
      // Return to home position
      targetLookAt.current.set(0, 0, 0);
      targetCamPos.current.set(0, 5, 12);
    }
  }, [activeNodeId, files]);

  useFrame(() => {
    // Smoothly interpolate camera position
    camera.position.lerp(targetCamPos.current, 0.05);

    // Smoothly interpolate controls target if controls are available
    if (controls) {
      const orbitControls = controls as any;
      orbitControls.target.lerp(targetLookAt.current, 0.05);
      orbitControls.update();
    }
  });

  return null;
}

// Rotating network constellation group
function Constellation() {
  const groupRef = useRef<THREE.Group>(null);
  const running = useDashboardStore((state) => state.running);
  const activeNodeId = useDashboardStore((state) => state.activeNodeId);
  const files = useDashboardStore((state) => state.files);

  useFrame((state) => {
    if (groupRef.current) {
      // Rotate constellation slowly if not focused on a specific node
      if (activeNodeId === null) {
        // Spin slightly faster when running analysis to simulate data calculation
        const speed = running ? 0.003 : 0.001;
        groupRef.current.rotation.y += speed;
      } else {
        // Gently ease rotation back to match selected node perspective
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, 0.02);
      }
      
      // Gentle floating animation
      groupRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 0.5) * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      {files.map((file, index) => {
        // Arrange nodes in a circular orbital constellation
        const angle = (index / files.length) * Math.PI * 2;
        const radius = 4;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = Math.sin(index * 2) * 0.8; // wave pattern

        return (
          <CommitNode
            key={file.name}
            id={index}
            position={[x, y, z]}
            file={file}
          />
        );
      })}
      
      {/* Curved connection lines linking the orbital graph */}
      <ConnectionLines />
    </group>
  );
}

export function DashboardCanvas() {
  return (
    <div className="absolute inset-0 w-full h-full z-0 bg-[#04040a]">
      <Canvas
        camera={{ position: [0, 5, 12], fov: 45 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        {/* Deep Space Background */}
        <color attach="background" args={['#04040a']} />
        
        {/* Stars particles */}
        <Stars
          radius={80}
          depth={40}
          count={3500}
          factor={4}
          saturation={0.8}
          fade
          speed={0.5}
        />
        
        {/* Subtle grid base reflecting spatial grid lines */}
        <Grid
          position={[0, -2, 0]}
          args={[30, 30]}
          cellSize={1.5}
          cellThickness={0.5}
          cellColor="#1e1b4b"
          sectionSize={4.5}
          sectionThickness={1}
          sectionColor="#2e1065"
          fadeDistance={25}
          infiniteGrid
        />

        {/* Ambient environment light */}
        <ambientLight intensity={0.4} color="#18182f" />
        
        {/* Directional light casting shadow highlights */}
        <directionalLight
          position={[5, 10, 3]}
          intensity={1.2}
          color="#38bdf8"
        />
        
        {/* Neon spotlight for the central node graph */}
        <spotLight
          position={[0, 8, 0]}
          intensity={3}
          distance={15}
          angle={Math.PI / 3}
          penumbra={0.8}
          color="#ec4899"
          castShadow
        />

        {/* Glowing point light inside the orbit */}
        <pointLight position={[0, 0, 0]} intensity={1.5} distance={10} color="#a855f7" />

        {/* Rotating nodes and connections */}
        <ParticleWave />
        <Constellation />

        {/* Camera focus interpolator */}
        <CameraController />

        {/* User manual orbit controls */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2 + 0.1} // Restrict camera from looking below grid
          minDistance={4}
          maxDistance={22}
        />
      </Canvas>
      
      {/* Decorative radial overlay for vignette depth */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,#04040a_95%)]" />
    </div>
  );
}
