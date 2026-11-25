'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface MiniTwinCanvasProps {
  lampOn: boolean;
  fanSpin: boolean;
  geyserOn: boolean;
  isLightMode: boolean;
}

export const MiniTwinCanvas: React.FC<MiniTwinCanvasProps> = ({
  lampOn,
  fanSpin,
  geyserOn,
  isLightMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ lampOn, fanSpin, geyserOn });

  useEffect(() => {
    stateRef.current = { lampOn, fanSpin, geyserOn };
  }, [lampOn, fanSpin, geyserOn]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const width = el.clientWidth || 480;
    const height = el.clientHeight || 300;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isLightMode ? '#eef2f7' : '#0c1018');

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 40);
    camera.position.set(5.4, 4.6, 5.4);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    el.appendChild(renderer.domElement);

    const amb = new THREE.AmbientLight(0xffffff, isLightMode ? 1.15 : 0.65);
    scene.add(amb);

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 8, 4);
    scene.add(dir);

    // Floor Slab
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];

    const floorGeo = new THREE.BoxGeometry(4.4, 0.14, 3.6);
    geos.push(floorGeo);
    const floorMat = new THREE.MeshStandardMaterial({
      color: isLightMode ? 0xdbe3ee : 0x18202c,
      roughness: 0.7,
    });
    mats.push(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    scene.add(floor);

    // Back Cutaway Walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: isLightMode ? 0xf8fafc : 0x1e293b,
      roughness: 0.8,
    });
    mats.push(wallMat);
    const wallNorthGeo = new THREE.BoxGeometry(4.4, 2.0, 0.12);
    const wallWestGeo = new THREE.BoxGeometry(0.12, 2.0, 3.6);
    geos.push(wallNorthGeo, wallWestGeo);

    const wallNorth = new THREE.Mesh(wallNorthGeo, wallMat);
    wallNorth.position.set(0, 1.0, -1.74);
    const wallWest = new THREE.Mesh(wallWestGeo, wallMat);
    wallWest.position.set(-2.14, 1.0, 0);
    scene.add(wallNorth, wallWest);

    // Living Room Lamp Sphere + PointLight
    const bulbGeo = new THREE.SphereGeometry(0.24, 18, 18);
    geos.push(bulbGeo);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.1,
    });
    mats.push(bulbMat);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(-1.1, 1.55, -0.9);
    scene.add(bulb);

    const lampLight = new THREE.PointLight(0xfde047, 2.5, 5);
    lampLight.position.copy(bulb.position);
    scene.add(lampLight);

    // Ceiling Fan Assembly
    const fanGroup = new THREE.Group();
    fanGroup.position.set(0.3, 1.85, 0.1);
    const bladeGeo = new THREE.BoxGeometry(1.5, 0.04, 0.16);
    geos.push(bladeGeo);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.35 });
    mats.push(bladeMat);
    const b1 = new THREE.Mesh(bladeGeo, bladeMat);
    const b2 = new THREE.Mesh(bladeGeo, bladeMat);
    b2.rotation.y = Math.PI / 2;
    fanGroup.add(b1, b2);
    scene.add(fanGroup);

    // Geyser Block on West Wall
    const geyserGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.65, 16);
    geos.push(geyserGeo);
    const geyserMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x10b981,
      emissiveIntensity: 0.6,
    });
    mats.push(geyserMat);
    const geyser = new THREE.Mesh(geyserGeo, geyserMat);
    geyser.position.set(-1.8, 1.25, 0.9);
    scene.add(geyser);

    // Terrace Tank Corner Indicator
    const tankGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.72, 18);
    geos.push(tankGeo);
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.82,
    });
    mats.push(tankMat);
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(1.5, 0.45, -1.0);
    scene.add(tank);

    let rafId = 0;
    let angle = 0;
    const renderLoop = () => {
      rafId = window.requestAnimationFrame(renderLoop);
      const { lampOn: lOn, fanSpin: fOn, geyserOn: gOn } = stateRef.current;

      bulbMat.emissiveIntensity = lOn ? 1.4 : 0.08;
      lampLight.intensity = lOn ? 2.8 : 0;

      geyserMat.emissive.setHex(gOn ? 0xf97316 : 0x334155);
      geyserMat.emissiveIntensity = gOn ? 0.9 : 0.1;

      if (fOn) angle += 0.08;
      fanGroup.rotation.y = angle;

      renderer.render(scene, camera);
    };
    renderLoop();

    const onResize = () => {
      if (!el) return;
      const w = el.clientWidth || 480;
      const h = el.clientHeight || 300;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
    };
  }, [isLightMode]);

  return <div ref={containerRef} className="w-full h-64 sm:h-72 rounded-xl overflow-hidden" />;
};
