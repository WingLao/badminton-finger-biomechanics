"""從 MyoSim（myoarm_r）匯出前臂＋手部的骨骼、關節與肌腱路徑，供 Three.js 使用。

用法：python export_myosim_20261016.py <temp_myosim 路徑> <輸出 assets 路徑>
輸出：
  assets/myosim_hand.json            身體階層、關節、網格引用、肌腱站點
  assets/meshes/processed/*.bin      MuJoCo 編譯後的網格（float32 頂點＋uint32 面）
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, sys.argv[1])
import mujoco  # noqa: E402
import myo_sim  # noqa: E402

OUT = Path(sys.argv[2])
ROOT_BODY = "humerus_r"
TENDONS = {  # 教學用 6 組肌群 → MyoSim 肌腱名稱
    "FDP": ["FDP3_tendon", "FDP4_tendon", "FDP5_tendon", "FDP2_tendon"],
    "Thenar": ["OP_tendon"],
    "Interossei": ["RI2_tendon"],
    "Pronator": ["PT_tendon"],
    "Supinator": ["SUP_tendon"],
    "EDC": ["EDC3_tendon", "EDC4_tendon", "EDC5_tendon", "EDC2_tendon"],
}

m, d = myo_sim.load("myoarm_r")
name = lambda t, i: mujoco.mj_id2name(m, t, i)
B = mujoco.mjtObj.mjOBJ_BODY
root = mujoco.mj_name2id(m, B, ROOT_BODY)

# 子樹
keep = []
for b in range(m.nbody):
    p = b
    while p != 0 and p != root:
        p = m.body_parentid[p]
    if p == root:
        keep.append(b)
keep_set = set(keep)

(OUT / "meshes" / "processed").mkdir(parents=True, exist_ok=True)
bodies, meshes_done = [], {}
for b in keep:
    entry = {
        "name": name(B, b),
        "parent": None if b == root else name(B, m.body_parentid[b]),
        "pos": m.body_pos[b].round(6).tolist(),
        "quat": m.body_quat[b].round(6).tolist(),  # w x y z
        "joints": [], "geoms": [],
    }
    for j in range(m.body_jntadr[b], m.body_jntadr[b] + m.body_jntnum[b]):
        entry["joints"].append({
            "name": name(mujoco.mjtObj.mjOBJ_JOINT, j), "axis": m.jnt_axis[j].round(6).tolist(),
            "pos": m.jnt_pos[j].round(6).tolist(), "range": m.jnt_range[j].round(4).tolist(),
            "q0": float(m.qpos0[m.jnt_qposadr[j]]),
        })
    for g in range(m.body_geomadr[b], m.body_geomadr[b] + m.body_geomnum[b]):
        if m.geom_type[g] != mujoco.mjtGeom.mjGEOM_MESH:
            continue
        mid = m.geom_dataid[g]
        mname = name(mujoco.mjtObj.mjOBJ_MESH, mid)
        if mid not in meshes_done:
            va, vn = m.mesh_vertadr[mid], m.mesh_vertnum[mid]
            fa, fn = m.mesh_faceadr[mid], m.mesh_facenum[mid]
            v = m.mesh_vert[va:va + vn].astype(np.float32)
            f = m.mesh_face[fa:fa + fn].astype(np.uint32)
            (OUT / "meshes" / "processed" / f"{mname}.bin").write_bytes(np.uint32([vn, fn]).tobytes() + v.tobytes() + f.tobytes())
            meshes_done[mid] = mname
        entry["geoms"].append({"mesh": mname, "pos": m.geom_pos[g].round(6).tolist(), "quat": m.geom_quat[g].round(6).tolist()})
    bodies.append(entry)

tendons = {}
for group, tnames in TENDONS.items():
    tendons[group] = []
    for tn in tnames:
        t = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_TENDON, tn)
        if t < 0:
            print("missing tendon", tn)
            continue
        path = []
        for w in range(m.tendon_adr[t], m.tendon_adr[t] + m.tendon_num[t]):
            if m.wrap_type[w] != mujoco.mjtWrap.mjWRAP_SITE:
                continue
            s = m.wrap_objid[w]
            sb = m.site_bodyid[s]
            if sb not in keep_set:
                continue
            path.append({"body": name(B, sb), "pos": m.site_pos[s].round(6).tolist()})
        tendons[group].append({"name": tn, "path": path})

data = {"source": "MyoSim myoarm_r (Apache-2.0, https://github.com/MyoHub/myo_sim)", "units": "m",
        "root": ROOT_BODY, "bodies": bodies, "tendons": tendons}
(OUT / "myosim_hand.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
print(len(bodies), "bodies,", len(meshes_done), "meshes,", sum(len(v) for v in tendons.values()), "tendons")
for g, ts in tendons.items():
    print(g, [(t["name"], len(t["path"])) for t in ts])
