#!/bin/bash
# 一条命令：bash run.sh 配置.json "这次改了什么"
# 1) hero.py（Blender）装配 → hero_m2.glb + report.json（+ ruler_check.glb 只给量比例用）
# 2) 正交正面渲染尺子（标准头）→ check.py 量 18f 的 5 个比例 → check.json
# 3) 拷进游戏 src/models/people/，打包到 /tmp/moshi_local，起本地服务
# 4) shots.mjs 在游戏里拍 18h 的 14 张 → compose.py 拼图 + 写 info.txt
#    存到 <out>/检查截图/<月日_时分>_<改了什么>/ 和 <out>/检查截图/最新/
set -e
D=$(cd "$(dirname "$0")" && pwd); CFG=$1; WHAT=${2:-更新}
OUT=$(python3 -c "import json;print(json.load(open('$CFG'))['out'])")
GAME=$(cd "$D/../.." && pwd)
[ "$SKIP_HERO" ] || python3.11 "$D/hero.py" -- "$CFG" | grep '\[hero\]'
bash /tmp/vsrv.sh >/dev/null 2>&1 || true
ln -sfn "$OUT" /tmp/viewer/run_out
RC=$(python3 -c "import json;r=json.load(open('$OUT/report.json'))['ruler'];c=(r['chin']+r['top'])/2;print(f\"{c:.4f} {r['H']*0.55:.4f}\")")   # 尺子正中、半高 × 1.1
node "$D/viewer/shot.mjs" "f=run_out/ruler_check.glb&w=1000&h=1000&ortho=${RC#* }&bg=00ff00&novc=1&cam=0,${RC% *},5,0,${RC% *},0" "$OUT/ortho_head.png" > /dev/null
python3 "$D/check.py" "$OUT/ortho_head.png" > "$OUT/check.json"
cp "$OUT/hero_m2.glb" "$GAME/src/models/people/hero_m2.glb"
(cd "$GAME" && node build.mjs /tmp/moshi_local | tail -1)
bash /tmp/srv.sh >/dev/null 2>&1 || true
S="$OUT/检查截图/$(date +%m%d_%H%M)_$WHAT"; rm -rf "$S"
sed "s#from 'playwright'#from '$GAME/node_modules/playwright/index.mjs'#" "$D/shots.mjs" > /tmp/_shots.mjs
GLBS=$(python3 -c "import json;c=json.load(open('$CFG'));print(' '.join([c[k] for k in ('body','head','hairhead','cloth') if k in c] + [x['glb'] for x in c.get('hairheads', []) + c.get('outfits', [])]))")
# 设计 18v：男女各一组（男 = 第一颗男发型 + 第一套；女 = 第一颗女发型 + 第二套，没有就第一套）
for SX in ${SEXES:-m f}; do
  SD="$S/$([ $SX = m ] && echo 男 || echo 女)"
  timeout 320 node /tmp/_shots.mjs "http://localhost:8765/?debug" "$SD" "$SX"
  python3 "$D/compose.py" "$SD" "$OUT/report.json" "$OUT/check.json" "$WHAT" $GLBS > /dev/null
done
rm -rf "$OUT/检查截图/最新"; cp -R "$S" "$OUT/检查截图/最新"
echo "截图：$S"; cat "$S"/*/info.txt | head -60
