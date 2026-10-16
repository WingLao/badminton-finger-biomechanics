// 載入 MyoSim（myoarm_r）匯出的骨骼、關節與肌腱站點，依 MuJoCo 規則組成 Three.js 階層
// 身體變換＝T(body_pos)·R(body_quat)·Π[T(jpos)·R(axis, q−q0)·T(−jpos)]
import * as THREE from 'three';

export async function loadMyoSim(base = 'assets/') {
  const data = await fetch(`${base}myosim_hand.json`).then((r) => r.json());
  const root = new THREE.Group();
  root.scale.setScalar(100); // 公尺 → 公分
  const bodies = {}, joints = {};
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.62, metalness: 0.02 });

  for (const b of data.bodies) {
    const outer = new THREE.Group();
    outer.position.fromArray(b.pos);
    outer.quaternion.set(b.quat[1], b.quat[2], b.quat[3], b.quat[0]);
    const inner = new THREE.Group();
    inner.matrixAutoUpdate = false;
    outer.add(inner);
    (b.parent && bodies[b.parent] ? bodies[b.parent].inner : root).add(outer);
    bodies[b.name] = { outer, inner, def: b, meshes: [] };
    for (const j of b.joints) {
      const key = j.name.replace(/_r$/, '');
      joints[key] = { ...j, key, body: b.name, q: j.q0, axisV: new THREE.Vector3().fromArray(j.axis).normalize(), posV: new THREE.Vector3().fromArray(j.pos) };
    }
  }

  // 網格（MuJoCo 編譯後頂點，已在 geom 座標）
  const loads = [];
  for (const b of data.bodies) for (const g of b.geoms) {
    loads.push(fetch(`${base}meshes/processed/${g.mesh}.bin`).then((r) => r.arrayBuffer()).then((buf) => {
      const [vn, fn] = new Uint32Array(buf, 0, 2);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 8, vn * 3), 3));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, 8 + vn * 12, fn * 3), 1));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, boneMat.clone());
      mesh.position.fromArray(g.pos);
      mesh.quaternion.set(g.quat[1], g.quat[2], g.quat[3], g.quat[0]);
      mesh.name = g.mesh;
      bodies[b.name].inner.add(mesh);
      bodies[b.name].meshes.push(mesh);
    }));
  }
  await Promise.all(loads);

  const tq = new THREE.Quaternion(), tm = new THREE.Matrix4(), tr = new THREE.Matrix4(), tb = new THREE.Matrix4();
  function updateBodies() {
    for (const name in bodies) {
      const B = bodies[name], M = B.inner.matrix.identity();
      for (const j of B.def.joints) {
        const J = joints[j.name.replace(/_r$/, '')];
        tq.setFromAxisAngle(J.axisV, J.q - J.q0);
        tm.makeTranslation(J.posV.x, J.posV.y, J.posV.z);
        tr.makeRotationFromQuaternion(tq);
        tb.makeTranslation(-J.posV.x, -J.posV.y, -J.posV.z);
        M.multiply(tm).multiply(tr).multiply(tb);
      }
      B.inner.matrixWorldNeedsUpdate = true;
    }
    root.updateMatrixWorld(true);
  }
  function setJoint(key, rad) { if (joints[key]) joints[key].q = rad; }
  const siteWorld = (body, pos, out = new THREE.Vector3()) => bodies[body].inner.localToWorld(out.fromArray(pos));
  updateBodies();
  return { root, bodies, joints, data, setJoint, updateBodies, siteWorld };
}
