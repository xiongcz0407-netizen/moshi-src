# 设计 116B：第 5 关装甲暴君素材脚本

原图在 `美术/模型/副本/装甲暴君/`。Blender 用 python 的 `bpy` 模块跑（`python3 xxx.py`）。中间文件放 `RD`（默认 `/home/claude/fb5/rig`），原模型 `SRC`。做法跟 `tools/scream_rig`（第 4 关）一样，差别：

1. `rigbuild.py`：减面到约 7000，22 根骨（体素 0.01 代理 + 自动权重，放大 10 倍算）。装甲是硬壳、手臂内侧跟腰甲 / 大腿连在一起，所以权重另外按位置收：里面的不准跟手臂、外面的只准跟手臂、中间按离哪边近整块分；腰以下「一头跟手臂一头跟腿」的面删掉（不然手一抬拉出大片）；导弹箱整块给 `pod_L` / `pod_R`；`core` 不带权重。
2. `anim.py`：19 个动作；`bake.py` 烘进 NLA；`export.py` → `tyrant_raw.glb`；`prevanim.py` 离屏渲关键帧（`SHOTS=动作:秒,…`）。
3. `props.py 素材文件夹 输出文件夹`：door / tank / console、covers（cart ammo base cabinet）、pylon（pylon socket，小士兵删掉）、plates（从 BOSS 装甲上复制 3 块，加厚 0.012）。
4. 压缩：`node tools/glbpress.mjs 输入文件夹 src/models/fb5`
5. `cut2d.py 素材文件夹 src/img/fb5`：fx_laser（先抹灰格线）、fx_shield、decals、boss_5、floor、wall。
