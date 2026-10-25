# tools/test：开发自测用的脚本（设计 98/99 起放进仓库，开发1、开发2 都能跑）

都在仓库根目录跑。先 `npm install`。

## 不用浏览器（几秒钟）
| 脚本 | 测什么 | 用法 |
|---|---|---|
| `fbtest.mjs` | 副本存档逻辑 42 项：解锁、扣卷、第一次保底、**掉率（设计 98：66 / 25 / 3 / 6）**、背包满、炼宝、技能、晶石…… | `node tools/test/fbtest.mjs` |
| `fblogtest.mjs` | 掉落记录 8 项（设计 90 / 94） | `node tools/test/fblogtest.mjs` |
| `spitdodge.mjs` | 毒囊酸液喷吐在锁定区域 40 个位置躲不躲得开（设计 95） | `node tools/test/spitdodge.mjs` |
| `../fbsim.mjs` | 副本整局模拟：通关时间、挨打次数和伤害、毒池占场地、技能间隔 | `STAGE=2 GEARSET=e3x2 node tools/fbsim.mjs 60` |
| lint | 见 `tools/lint/README.txt` | |

- 全是 ✓ 就对；有 ✗ 时退出码是 1。

## 用浏览器截图、测数（几分钟）
1. 打包并开个本地网页：`node build.mjs /tmp/b && (cd /tmp/b && python3 -m http.server 8794 &)`
2. 跑场景：`SAVE=存档.json SCRIPT=tools/test/s_tox_spawn.mjs O=/tmp/shots node tools/test/fbrun.mjs`

可选的环境变量：
- `WH='[667,375]'`：换屏宽，默认 844×390。
- `CHROME=浏览器路径`：playwright 自带的浏览器版本对不上时用，比如 `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`。
- 存档 `SAVE`：用云存档仓库里下载的 json。**不要提交进仓库。**

场景脚本都是 `export default async (pg, shot) => {...}`，加一行 `export { pre } from './vtime.mjs'`，就用虚拟时间（`__vtStart()`、`__pump(毫秒)`）一帧一帧推，结果不受机器快慢影响。游戏要用 `?debug` 打开才有 `window.__g`、`__fbstg`、`__fbocc`。

| 场景 | 测什么 |
|---|---|
| `s_tox_spawn.mjs` | 设计 99：毒囊关从铁桥出生，走到封线，锁死（三张截图；镜头每帧挪多少；BOSS 有没有提前放技能） |
| `s_tox_face.mjs` | 设计 95：锁定区域里毒囊的头顶、下巴、胸口在屏幕上的位置。`SCAN=1` 扫整个区域，`POOL=1` 截毒池最多时 |
| `s_keys.mjs` | 设计 96：主角在角落时会不会被技能按钮盖住。`STG=1` 屠夫关，`STG=2` 毒囊关 |
| `s_fb_misc.mjs` | 设计 97：`FT=1` 查副本里超市飘字有没有拦住；不给 `FT` 就截屠夫关南墙变半透明 |

- 截图放 `O` 指定的目录，交结果时放进 `美术/检查截图/<日期>_设计XX/`。
