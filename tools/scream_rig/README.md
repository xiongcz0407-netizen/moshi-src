# 设计 114B：第 4 关尖啸者素材脚本

原图在 `美术/模型/副本/尖啸者/`。Blender 用 python 的 `bpy` 模块跑（`python3 xxx.py`）。中间文件放 `RD`（默认 `/home/claude/fb4/rig`），原模型 `SRC`。

1. `rigbuild.py`：BOSS 转成 Z 朝上、脸朝 -Y，减面到 6000，贴图 1024，绑 22 根骨（体素代理 + 自动权重；模型太小要放大 10 倍算权重），下巴 `jaw` 手动给权重 → `rigged.blend`
2. `anim.py`：13 个动作（关键帧 + 腿 IK）；`bake.py` 烘进 NLA → `animated.blend` + `meta.json`
3. `export.py` → `screamer_raw.glb`；`prevanim.py` 离屏渲关键帧（`SHOTS=动作:秒,…`）
4. `props.py 楼顶建筑.glb 掩体_4个.glb 输出文件夹`：拆 tower_house / stair_house / speaker（pole + horn）/ covers（ac pipe tank box）
5. 压缩：`node tools/glbpress.mjs 输入文件夹 src/models/fb4`
6. `cut2d.py 素材文件夹 src/img/fb4`：特效、乌鸦、贴花、头像、地面、天际线
