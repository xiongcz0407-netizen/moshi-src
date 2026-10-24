# 设计 18h：把 shots.mjs 出的分图拼成 10、11、12、13，写 info.txt
# 用法：python3 compose.py <截图文件夹> <report.json> <check.json> <改了什么> <用到的 GLB 文件…>
import sys, os, json, glob, time
from PIL import Image
D, rep, chk, what = sys.argv[1], json.load(open(sys.argv[2])), json.load(open(sys.argv[3])), sys.argv[4]
def row(files, out):
    ims = [Image.open(f) for f in files]; w, h = ims[0].size; o = Image.new('RGB', (w * len(ims), h))
    for i, im in enumerate(ims): o.paste(im, (i * w, 0))
    o.save(out)
    for f in files: os.remove(f)
row([f'{D}/10_发色_{i}.png' for i in (1, 2, 3, 4)], f'{D}/10_发色.png')   # 黑、深棕、金、粉
row(sorted(glob.glob(f'{D}/11_套装_*.png')), f'{D}/11_套装.png')               # 所有套装并排（设计 18q）
row(sorted(glob.glob(f'{D}/16_发型x套装_*.png')), f'{D}/16_发型x套装.png')
row([f'{D}/12_走路_{i}.png' for i in (1, 2, 3, 4)], f'{D}/12_走路.png')
row([f'{D}/13_跑步_{i}.png' for i in (1, 2, 3, 4)], f'{D}/13_跑步.png')
row([f'{D}/15_跑步_正面_{i}.png' for i in (1, 2, 3, 4)], f'{D}/15_跑步_正面.png')
for n in ('20_跑步_左侧红', '21_走路_左侧红'):
    if os.path.exists(f'{D}/{n}_1.png'): row([f'{D}/{n}_{i}.png' for i in range(1, 9)], f'{D}/{n}.png')
L = [f'这次改了什么：{what}', f'时间：{time.strftime("%m-%d %H:%M")}', '', '用到的 GLB：']
for f in sys.argv[5:]: L.append(f'  {os.path.basename(f)}　{time.strftime("%m-%d %H:%M", time.localtime(os.path.getmtime(f)))}')
HHS = rep.get('hairheads') or {'m1': rep.get('hairhead', {})}
L += ['', '缩放倍数：', f"  标准头（尺子，不显示）{rep['head_scale']}"] + [f"  发型头 {k} {hh.get('scale')}（相对标准头 {hh.get('scale_vs_ruler')}），深度差 {hh.get('depth_diff', 0) * 100:.1f}%，肤色 {hh.get('skin_hex')}" for k, hh in HHS.items()]
L += [f"  套装 " + '、'.join(f"{k} {v['scale']}" for k, v in rep.get('outfits', {}).items()),
      f"  标准脖子（设计 18v）：取自基础身体2，截口高度 {rep.get('std_neck', {}).get('cut_z')}（脖子根 {rep.get('std_neck', {}).get('neck_base')}、下巴 {rep.get('std_neck', {}).get('chin')} 的正中），截口半径 {rep.get('std_neck', {}).get('radius')}，上端伸进头里（头底 {rep.get('std_neck', {}).get('head_under')}）",
      '  每套焊接：' + '；'.join(f"{k} 截口半径 {v.get('neck_r_at_cut')}（差 {(v.get('neck_r_diff') or 0) * 100:+.0f}%），截口以上衣服 {v.get('cloth_above_cut')} 个面，焊接 {v.get('weld')}" for k, v in rep.get('outfits', {}).items()),
      '', f"头高 ÷ 全身高 = {rep['body']['head_ratio']}（设计 18v：约 0.30）", f"量到的关节点：{json.dumps(rep['body'].get('landmarks', {}), ensure_ascii=False)}", '', '18f 的 5 个比例（正交正面，量标准头尺子）：']
for k, v in chk.items(): L.append(f"  {k}：{v['量到']}（规范 {v['规范']}，差 {v['差'] * 100:+.1f}%）")
an = rep.get('anim', {})
for k, v in rep.get('swing', {}).items():
    L.append(f"摆臂自查 {k}：左腿 / 左手相关 {v['corr_leftleg_leftarm']}（-1 = 正好相反），左腿最前第 {v['leftleg_front_frame']} 帧、左手最后第 {v['leftarm_back_frame']} 帧、右手最前第 {v.get('rightarm_front_frame')} 帧；左手角度 {v['arm_range_L']}，右手 {v['arm_range_R']}；8 帧 [帧, 左大腿°, 左上臂°, 左手在身子前(-)/后(+)]：{v['frames8']}")
L += ['', '走 / 跑（按新腿长自动算的地面速度，游戏单位 / 秒）：' + '、'.join(f"{k} {v.get('ground_speed_game')}（一圈 {v.get('cycle_s')} 秒，胯上下 {v.get('hip_range')}）" for k, v in an.items())]
L += ['', '面数：'] + [f'  {k} {v}' for k, v in rep['faces'].items()]
L += [''] + [f"头发遮罩（按面分）{k}：{hh.get('hair_faces_pct')} 的面算头发；小肉色斑填掉 {hh.get('hair_spots_filled')} 块，刘海尖 / 额头头发影子改算头发 {hh.get('bang_tip_faces')} 个面" for k, hh in HHS.items()]
L += ["套装皮肤区：" + '、'.join(f"{k} {v['skin_vert_pct']}（参考肤色 {v.get('skin_ref')}）" for k, v in rep.get('outfits', {}).items())]
L += ['', '工具自动报的问题：'] + ([f'  {w}' for w in rep['warn']] or ['  没有'])
SC = os.path.join(os.path.dirname(os.path.abspath(sys.argv[2])), 'selfcheck.json')   # 人看截图写的自查，放在输出目录（跟 report.json 一起）
if os.path.exists(SC): L += ['', '自查（人看截图写）：'] + [f'  {x}' for x in json.load(open(SC))]
CH = os.path.join(os.path.dirname(os.path.abspath(sys.argv[2])), 'changes.json')    # 用户 10-18：每次改完列出改了哪些文件、每个文件改了什么
if os.path.exists(CH): L += ['', '改了哪些文件：'] + [f'  {k}：{v}' for k, v in json.load(open(CH)).items()]
open(f'{D}/info.txt', 'w').write('\n'.join(L) + '\n')
print('\n'.join(L))
