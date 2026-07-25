import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const GooseRoom: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    camera.position.set(0, 0.15, 1.9);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.7);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(2, 4, 5);
    const fillLight = new THREE.DirectionalLight(0x9dd9ff, 1.0);
    fillLight.position.set(-3, 1, 2);
    scene.add(ambientLight, keyLight, fillLight);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 3.2;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 200;

    let goose: THREE.Object3D | null = null;
    let rafId = 0;
    let cancelled = false;

    const fitModel = (object: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      object.position.x -= center.x;
      object.position.y -= center.y;
      object.position.z -= center.z;

      const maxAxis = Math.max(size.x, size.y, size.z);
      const scale = 1.25 / maxAxis;
      object.scale.setScalar(scale);
    };

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const render = () => {
      if (cancelled) return;
      controls.update();
      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(render);
    };

    const loadModel = async () => {
      try {
        const materials = await new Promise<any>((resolve, reject) => {
          new MTLLoader()
            .setPath('/goose-room/')
            .load('3DModel.mtl', resolve, undefined, reject);
        });

        materials.preload();

        const object = await new Promise<THREE.Group>((resolve, reject) => {
          new OBJLoader()
            .setMaterials(materials)
            .setPath('/goose-room/')
            .load('3DModel.obj', resolve, undefined, reject);
        });

        if (cancelled) return;

        object.traverse((node: THREE.Object3D) => {
          const mesh = node as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
          }
        });

        fitModel(object);
        goose = object;
        scene.add(object);
        setLoading(false);
        const token = localStorage.getItem('token');
        if (token) {
          fetch('/api/titles/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action: 'goose_room' })
          }).then(r => r.json()).then(data => {
            if (data.newlyUnlocked && data.newlyUnlocked.length > 0) {
              alert(`🎉 새 칭호 획득: ${data.newlyUnlocked.map((t: any) => t.name).join(', ')}`);
            }
          }).catch(() => {});
        }
      } catch (loadError) {
        if (!cancelled) {
          setError('거위 모델을 불러오지 못했습니다.');
          setLoading(false);
        }
      }
    };

    const handleResize = () => resize();
    window.addEventListener('resize', handleResize);

    resize();
    void loadModel();
    render();

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      window.cancelAnimationFrame(rafId);
      controls.dispose();
      renderer.dispose();
      if (goose) {
        scene.remove(goose);
      }
    };
  }, []);

  return (
    <main className="goose-room-page">
      <Helmet>
        <title>거위의 방</title>
        <meta name="description" content="만든 사람:구윤재 만든사람이 맨날 끌어안고 자는 거위인형임" />
      </Helmet>

      <section className="goose-room-shell">
        <div className="goose-room-copy">
          <p className="goose-room-eyebrow">이스터 에그</p>
          <h1>거위의 방</h1>
          <p className="goose-room-description">
            만든 사람:구윤재<br />
            만든사람이 맨날 끌어안고 자는 거위인형임<br />
            그것은 상당한 거위인!<br />
            꽥!!!!!!<br />
            (참고: 만든사람은 항상 거위를 꾸스 라고 부른다.)<br />
          </p>
          <p className="goose-room-hint">모델을 드래그해서 돌려보세요. 자동 회전도 켜져 있습니다.</p>
        </div>

        <div className="goose-stage">
          <div className="goose-stage-frame">
            <canvas ref={canvasRef} className="goose-canvas" />
            {loading && <div className="goose-overlay">거위가 방에 들어오는 중...</div>}
            {error && <div className="goose-overlay goose-overlay-error">{error}</div>}
          </div>
        </div>
      </section>
    </main>
  );
};

export default GooseRoom;
