"""设计 116B：装甲暴君动作（19 个，名字照 116 第 2 节）。做法跟落石巨人、尖啸者一样：关键帧 + 程序（腿 IK 防滑脚），
机炮、铁拳、导弹箱在 bake.py 里用弹簧跟。要沉、要重：动作幅度小、落地一顿。
坐标：Z 上，-Y 前，-X 是它的右手（转管机炮）。角度用骨架轴：
  X 正：向上的骨头往前倾；向下的骨头往后摆（负 = 往前抬）。导弹箱 pod：X 负 = 往后翻（开盖，炮口朝上）。
  Y 正：向上的骨头往左（+X）歪；向下的骨头末端往 -X（右手往外张 = +，左手往外张 = -）。
  Z 正：往左转。
"""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from joints import J, PAR  # noqa
FPS = 30
D = math.radians


def ease(u, k):
    u = max(0.0, min(1.0, u))
    if k == 'lin': return u
    if k == 'in': return u ** 2.4
    if k == 'in3': return u ** 3.2
    if k == 'out': return 1 - (1 - u) ** 2.4
    return u * u * (3 - 2 * u)


CH = ['root', 'Hips', 'Spine', 'Chest', 'neck', 'head', 'pod_L', 'pod_R', 'R_Shoulder', 'R_Arm', 'R_ForeArm', 'gun',
      'L_Shoulder', 'L_Arm', 'L_ForeArm', 'L_Hand']

BASE = {
    'root': (0, 0.0, -0.01), 'Hips': (2, 0, 0), 'Spine': (3, 0, 0), 'Chest': (4, 0, 0), 'neck': (-3, 0, 0), 'head': (-4, 0, 0),
    'pod_L': (0, 0, 0), 'pod_R': (0, 0, 0),
    'R_Shoulder': (0, 0, 0), 'R_Arm': (-2, 4, 0), 'R_ForeArm': (-8, 0, 0), 'gun': (0, 0, 0),
    'L_Shoulder': (0, 0, 0), 'L_Arm': (-2, -4, 0), 'L_ForeArm': (-10, 0, 0), 'L_Hand': (0, 0, 0),
}
STANCE = {'L': (0.12, 0.03, 0.09, 0), 'R': (-0.12, 0.03, 0.09, 0)}


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def keyed(keys, t):
    full = []; cur = {}
    for tm, p, e in keys:
        cur = dict(cur); cur.update(p); full.append((tm, cur, e))
    if t <= full[0][0]: return dict(full[0][1])
    for i in range(1, len(full)):
        t0, p0, _ = full[i - 1]; t1, p1, e = full[i]
        if t <= t1:
            u = ease((t - t0) / (t1 - t0), e); out = {}
            for k in set(p0) | set(p1):
                a = p0.get(k, p1.get(k)); b = p1.get(k, a)
                out[k] = tuple(x + (y - x) * u for x, y in zip(a, b))
            return out
    return dict(full[-1][1])


def rel(keys):
    out = []; prev = {}
    for tm, p, e in keys:
        q = {}
        for c in CH:
            b = BASE.get(c, (0, 0, 0))
            q[c] = add(b, p[c]) if c in p else (prev.get(c, b) if p else b)
        out.append((tm, q, e)); prev = q
    return out


def shake(t, a, f1=63, f2=47):
    return (a * math.sin(t * f1), a * math.sin(t * f2 + 1.3), 0)


def lerpf(a, b, u):
    return tuple(x + (y - x) * u for x, y in zip(a, b))


P = dict
ACT = {}
FEET = lambda: {'L': STANCE['L'], 'R': STANCE['R']}

# 机炮手臂抬平（炮管朝前）
GUN_UP = P(R_Arm=(-52, 6, -6), R_ForeArm=(-26, 0, 0))
# 单膝跪地：右膝着地，左脚在前
KNEEL = P(root=(0, 0.02, -0.17), Hips=(10, 0, 0), Spine=(10, 0, 0), Chest=(10, 0, 0), neck=(-12, 0, 0), head=(-10, 0, 0),
          R_Arm=(-14, 12, 0), R_ForeArm=(-14, 0, 0), L_Arm=(-40, -6, 0), L_ForeArm=(-40, 0, 0))
KNEE_FEET = {'L': (0.12, -0.13, 0.09, 0), 'R': (-0.12, 0.23, 0.07, 55)}


# 待机：重心左右慢慢换，机炮手臂微晃，导弹箱轻轻颤
def idle(t, T=2.4):
    w = 2 * math.pi * t / T; sh = math.sin(w); br = math.sin(2 * w)
    p = keyed(rel([(0, {}, 'lin')]), 0)
    p['root'] = (0.008 * sh, 0, -0.01 - 0.003 * (0.5 + 0.5 * math.sin(2 * w - 1)))
    p['Hips'] = add(p['Hips'], (0, -2 * sh, 1.5 * sh)); p['Spine'] = add(p['Spine'], (0.6 * br, 1.2 * sh, 0))
    p['Chest'] = add(p['Chest'], (1.0 * br, 1.0 * sh, -1.5 * sh)); p['head'] = add(p['head'], (-0.8 * br, 0, 2 * math.sin(w + 0.7)))
    p['R_Arm'] = add(p['R_Arm'], (2.5 * math.sin(w + 0.8), 1 * sh, 0)); p['R_ForeArm'] = add(p['R_ForeArm'], (-2 * br, 0, 0))
    p['L_Arm'] = add(p['L_Arm'], (1.5 * math.sin(w + 2.0), 0, 0))
    p['pod_L'] = (0.8 * math.sin(2 * w + 0.3), 0, 0); p['pod_R'] = (0.8 * math.sin(2 * w + 1.4), 0, 0)
    return p, FEET()
ACT['idle'] = dict(T=2.4, loop=True, f=idle)


# 沉重地走：步子小、每步落地一沉，上身左右晃
def gait(t, T, step, lift, drop, lean, bob, stanceFrac, arm):
    out = {}; ph = (t / T) % 1.0
    for side, off in (('L', 0.0), ('R', 0.5)):
        q = (ph + off) % 1.0; x0, y0, z0, _ = STANCE[side]
        if q < stanceFrac:
            u = q / stanceFrac; y = y0 - step + 2 * step * u; z = z0; pitch = -6 * (1 - u) ** 6 + 16 * max(0, u - 0.75) / 0.25 * 0.6
        else:
            u = (q - stanceFrac) / (1 - stanceFrac); s = u * u * (3 - 2 * u)
            y = y0 + step - 2 * step * s; z = z0 + lift * math.sin(math.pi * u) ** 1.2; pitch = 10 * (1 - u) ** 2 - 8 * u ** 3
        out[side] = (x0, y, z, pitch)

    def contact(phase):
        d = (ph - phase) % 1.0
        return math.exp(-((d - 0.06) / 0.06) ** 2) if d < 0.5 else 0
    sink = contact(0.0) + contact(0.5)
    side = math.sin(2 * math.pi * ph); sw = side
    p = keyed(rel([(0, {}, 'lin')]), 0)
    p['root'] = (0.016 * side, 0, -0.01 - drop - bob * sink)
    p['Hips'] = add(p['Hips'], (lean * 0.3, -4 * side, 5 * sw)); p['Spine'] = add(p['Spine'], (lean * 0.3, 2 * side, -2 * sw))
    p['Chest'] = add(p['Chest'], (lean * 0.4 + 2 * sink, 2 * side, -4 * sw)); p['neck'] = add(p['neck'], (-lean * 0.5, 0, 2 * sw))
    p['R_Arm'] = add(p['R_Arm'], (-arm * 0.5 * sw, 0, 0)); p['L_Arm'] = add(p['L_Arm'], (arm * sw, 0, 0))
    p['pod_L'] = (-3 * sink, 0, 0); p['pod_R'] = (-3 * sink, 0, 0)   # 落地导弹箱一颠
    return p, out

WALK = dict(T=1.4, step=0.06, lift=0.035, drop=0.012, lean=5, bob=0.014, stanceFrac=0.64, arm=10)
ACT['walk'] = dict(T=WALK['T'], loop=True, f=lambda t: gait(t, **WALK), speed=2 * WALK['step'] / (WALK['T'] * WALK['stanceFrac']))


# 机炮开火（循环）：手臂抬平，一连 3 下后坐
def fire(t):
    p = keyed(rel([(0, dict(GUN_UP, Chest=(2, 0, 8), Spine=(3, 0, 4), head=(-4, 0, -6)), 'lin')]), 0)
    k = 0.0
    for c in (0.0, 0.3, 0.6):
        d = (t - c) % 0.9
        k += math.exp(-d / 0.05) if d < 0.25 else 0
    p['R_Arm'] = add(p['R_Arm'], (-4 * k, 0, 0)); p['R_ForeArm'] = add(p['R_ForeArm'], (-3 * k, 0, 0))
    p['Chest'] = add(p['Chest'], (-1.2 * k, 0, 0)); p['root'] = add(p['root'], (0, 0.004 * k, 0))
    return p, FEET()
ACT['fire'] = dict(T=0.9, loop=True, f=fire)


# 旋转激光：双脚站稳，上身从左拧到右（机炮平举）
def sweep(t):
    u = ease(min(1, max(0, (t - 0.15) / 1.7)), 'smooth'); a = 1 - 2 * u   # +1 左 → -1 右
    p = keyed(rel([(0, GUN_UP, 'lin')]), 0)
    if t < 0.15: p = keyed(rel([(0.0, {}, 'smooth'), (0.15, GUN_UP, 'out')]), t)
    p['Hips'] = add(p['Hips'], (0, 0, 14 * a)); p['Spine'] = add(p['Spine'], (0, 0, 16 * a)); p['Chest'] = add(p['Chest'], (0, 0, 22 * a))
    p['head'] = add(p['head'], (0, 0, 4 * a)); p['root'] = add(p['root'], (0, 0, -0.012))
    if t > 1.85:
        p = {k: lerpf(v, BASE.get(k, (0, 0, 0)), ease((t - 1.85) / 0.15, 'smooth')) if k in BASE else v for k, v in p.items()}
    return p, FEET()
ACT['sweep'] = dict(T=2.0, loop=False, f=sweep)


# 导弹齐射：耸肩、导弹箱翻开 → 0.6 发射身子往后一顿 → 合上
def missile(t):
    k = [(0.00, {}, 'smooth'),
         (0.40, P(root=(0, 0.004, -0.02), Chest=(-2, 0, 0), R_Shoulder=(0, 0, 0), pod_L=(-34, 0, 0), pod_R=(-34, 0, 0),
                  R_Arm=(-4, 10, 0), L_Arm=(-4, -10, 0), neck=(-6, 0, 0)), 'out'),
         (0.60, P(root=(0, 0.012, -0.024), Chest=(-7, 0, 0), pod_L=(-40, 0, 0), pod_R=(-40, 0, 0)), 'in3'),
         (0.72, P(root=(0, 0.008, -0.022), Chest=(-5, 0, 0)), 'out'),
         (1.00, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['missile'] = dict(T=1.0, loop=False, f=missile, hit=0.6)


# 地毯轰炸：两臂张开、仰身，导弹箱全开 → 1.2 发射
def carpet(t):
    k = [(0.00, {}, 'smooth'),
         (0.90, P(root=(0, 0.01, -0.02), Hips=(-2, 0, 0), Spine=(-6, 0, 0), Chest=(-12, 0, 0), neck=(-8, 0, 0), head=(-10, 0, 0),
                  pod_L=(-50, 0, 0), pod_R=(-50, 0, 0), R_Arm=(-24, 58, 0), R_ForeArm=(-10, 0, 0), L_Arm=(-24, -58, 0), L_ForeArm=(-10, 0, 0)), 'smooth'),
         (1.20, P(root=(0, 0.02, -0.03), Chest=(-15, 0, 0), pod_L=(-56, 0, 0), pod_R=(-56, 0, 0)), 'in3'),
         (1.32, P(root=(0, 0.016, -0.028)), 'out'),
         (1.60, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 1.2 < t < 1.45:
        a = math.sin(math.pi * (t - 1.2) / 0.25); p['Chest'] = add(p['Chest'], shake(t, 1.5 * a))
    return p, FEET()
ACT['carpet'] = dict(T=1.6, loop=False, f=carpet, hit=1.2)


# 激光网格起手：机炮朝地一指，左手按胸口 → 1.0
def grid(t):
    k = [(0.00, {}, 'smooth'),
         (0.70, P(root=(0, -0.004, -0.02), Chest=(8, 0, 6), neck=(-2, 0, 0), head=(4, 0, 0),
                  R_Arm=(-46, 4, 0), R_ForeArm=(6, 0, 0), gun=(0, 0, 0), L_Arm=(-48, 26, 0), L_ForeArm=(-104, 0, 0), L_Hand=(10, 0, 0)), 'smooth'),
         (1.00, P(R_Arm=(-50, 4, 0), Chest=(10, 0, 6)), 'in3'),
         (1.20, P(R_Arm=(-48, 4, 0)), 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['grid'] = dict(T=1.2, loop=False, f=grid, hit=1.0)


# 单膝跪地（开护盾），停在跪着
def kneel(t):
    u = ease(t / 0.8, 'out')
    p = keyed(rel([(0.00, {}, 'smooth'), (0.55, KNEEL, 'out'), (0.65, dict(KNEEL, root=(0, 0.02, -0.18)), 'smooth'), (0.80, KNEEL, 'smooth')]), t)
    f = {s: lerpf(STANCE[s], KNEE_FEET[s], ease(min(1, t / 0.55), 'smooth')) for s in ('L', 'R')}
    if t < 0.5:
        x0, y0, z0, pt = f['R']; f['R'] = (x0, y0, z0 + 0.05 * math.sin(math.pi * t / 0.5), pt)
    return p, f
ACT['kneel'] = dict(T=0.8, loop=False, f=kneel)


def kneel_loop(t, T=2.0):
    w = 2 * math.pi * t / T; br = math.sin(w)
    p = keyed(rel([(0, KNEEL, 'lin')]), 0)
    p['root'] = add(p['root'], (0, 0, 0.004 * br)); p['Chest'] = add(p['Chest'], (-1.5 * br, 0, 0)); p['head'] = add(p['head'], (1 * br, 0, 0))
    p['pod_L'] = (1.2 * br, 0, 0); p['pod_R'] = (1.2 * math.sin(w + 0.6), 0, 0)
    return p, dict(KNEE_FEET)
ACT['kneel_loop'] = dict(T=2.0, loop=True, f=kneel_loop)


# 盾被打破：跪着往后一仰 → 瘫一下（头垂、手垂） → 站起来
def shield_break(t):
    k = [(0.00, KNEEL, 'smooth'),
         (0.25, dict(KNEEL, root=(0, 0.05, -0.16), Hips=(-6, 0, 0), Spine=(-10, 0, 0), Chest=(-16, 0, 0), neck=(10, 0, 0), head=(14, 0, 0),
                     R_Arm=(10, 20, 0), L_Arm=(10, -20, 0)), 'out'),
         (0.80, dict(KNEEL, root=(0, 0.02, -0.19), Hips=(16, 0, 0), Spine=(14, 0, 0), Chest=(16, 0, 0), neck=(-2, 0, 0), head=(16, 0, 0),
                     R_Arm=(4, 6, 0), R_ForeArm=(-4, 0, 0), L_Arm=(4, -6, 0), L_ForeArm=(-6, 0, 0)), 'smooth'),
         (1.40, dict(KNEEL, root=(0, 0.02, -0.19), Hips=(16, 0, 0), Spine=(14, 0, 0), Chest=(16, 0, 0), head=(18, 0, 4),
                     R_Arm=(4, 6, 0), L_Arm=(4, -6, 0)), 'smooth'),
         (2.00, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 0.25 < t < 1.3:
        a = math.sin(math.pi * (t - 0.25) / 1.05); p['Chest'] = add(p['Chest'], shake(t, 1.2 * a, 37, 29))
    u = ease(max(0, (t - 1.4) / 0.6), 'smooth')
    return p, {s: lerpf(KNEE_FEET[s], STANCE[s], u) for s in ('L', 'R')}
ACT['shield_break'] = dict(T=2.0, loop=False, f=shield_break)


# 电磁牵引：机炮手臂高举 → 往自己这边一拉（身子往后靠）
def pull(t):
    k = [(0.00, {}, 'smooth'),
         (0.45, P(root=(0, -0.006, -0.01), Chest=(-4, 0, 8), R_Arm=(-140, 8, 0), R_ForeArm=(-10, 0, 0), L_Arm=(-10, -14, 0), neck=(-6, 0, 0)), 'out'),
         (0.80, P(root=(0, 0.02, -0.03), Hips=(-2, 0, 0), Spine=(-6, 0, 0), Chest=(-10, 0, 4), R_Arm=(-70, 2, 0), R_ForeArm=(-80, 0, 0)), 'in'),
         (1.00, P(root=(0, 0.022, -0.032), R_Arm=(-64, 2, 0)), 'out'),
         (1.20, P(root=(0, 0.01, -0.02), Chest=(-2, 0, 0), R_Arm=(-50, 4, 0), R_ForeArm=(-40, 0, 0)), 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['pull'] = dict(T=1.2, loop=False, f=pull)


# 贴脸霰弹炮：机炮往前一顶 → 0.45 开炮，后坐很大（手臂往上弹、上身往后仰）
def shotgun(t):
    k = [(0.00, P(root=(0, 0.01, -0.02), Chest=(-2, 0, 0), R_Arm=(-50, 4, 0), R_ForeArm=(-40, 0, 0)), 'smooth'),
         (0.38, P(root=(0, -0.03, -0.04), Hips=(8, 0, 0), Spine=(8, 0, 0), Chest=(12, 0, 10), neck=(-10, 0, 0),
                  R_Arm=(-68, 6, -4), R_ForeArm=(-14, 0, 0), L_Arm=(-30, -10, 0), L_ForeArm=(-40, 0, 0)), 'out'),
         (0.45, P(root=(0, -0.034, -0.04)), 'smooth'),
         (0.52, P(root=(0, 0.03, -0.03), Hips=(-4, 0, 0), Spine=(-8, 0, 0), Chest=(-14, 0, 4), neck=(6, 0, 0), head=(6, 0, 0),
                  R_Arm=(-104, 10, 0), R_ForeArm=(-30, 0, 0), L_Arm=(6, -16, 0)), 'in3'),
         (0.66, P(root=(0, 0.034, -0.032), Chest=(-15, 0, 4), R_Arm=(-96, 10, 0)), 'out'),
         (0.90, {}, 'smooth')]
    p = keyed(rel(k), t); f = FEET()
    if t > 0.45:   # 后坐：右脚往后撤一步
        u = math.sin(math.pi * min(1, (t - 0.45) / 0.3)) if t < 0.6 else 1; x0, y0, z0, _ = STANCE['R']
        v = ease(min(1, (t - 0.45) / 0.2), 'out'); f['R'] = (x0, y0 + 0.05 * v - 0.05 * ease(max(0, (t - 0.7) / 0.2), 'smooth'), z0 + 0.03 * math.sin(math.pi * min(1, (t - 0.45) / 0.2)), 0)
    return p, f
ACT['shotgun'] = dict(T=0.9, loop=False, f=shotgun, hit=0.45)


# 电磁脉冲：两臂往后张开、蓄力 → 1.3 胸口核心往外一冲
def emp(t):
    k = [(0.00, {}, 'smooth'),
         (0.70, P(root=(0, 0.01, -0.04), Hips=(6, 0, 0), Spine=(8, 0, 0), Chest=(10, 0, 0), neck=(-8, 0, 0),
                  R_Arm=(-10, 30, 0), R_ForeArm=(-50, 0, 0), L_Arm=(-10, -30, 0), L_ForeArm=(-50, 0, 0)), 'out'),
         (1.15, P(root=(0, 0.014, -0.03), Hips=(-2, 0, 0), Spine=(-8, 0, 0), Chest=(-12, 0, 0), neck=(-6, 0, 0), head=(-8, 0, 0),
                  R_Arm=(24, 48, 0), R_ForeArm=(-14, 0, 0), L_Arm=(24, -48, 0), L_ForeArm=(-14, 0, 0), pod_L=(-14, 0, 0), pod_R=(-14, 0, 0)), 'smooth'),
         (1.30, P(root=(0, -0.016, -0.03), Spine=(-10, 0, 0), Chest=(-18, 0, 0), R_Arm=(30, 56, 0), L_Arm=(30, -56, 0)), 'in3'),
         (1.50, P(root=(0, -0.012, -0.026), Chest=(-14, 0, 0)), 'out')]
    p = keyed(rel(k), t)
    if 0.7 < t < 1.3:
        a = (t - 0.7) / 0.6; p['Chest'] = add(p['Chest'], shake(t, 1.2 * a))
    return p, FEET()
ACT['emp'] = dict(T=1.5, loop=False, f=emp, hit=1.3)


# 主炮蓄力（循环）：半蹲、机炮手臂往前架，左手托着，身子绷紧发抖
CHARGE = P(root=(0, 0.004, -0.06), Hips=(8, 0, 6), Spine=(6, 0, 4), Chest=(8, 0, 8), neck=(-12, 0, -6), head=(-6, 0, -4),
           R_Arm=(-60, 8, -6), R_ForeArm=(-24, 0, 0), L_Arm=(-56, 34, 0), L_ForeArm=(-62, 0, 0), L_Hand=(0, 0, 0), pod_L=(-6, 0, 0), pod_R=(-6, 0, 0))
CH_FEET = {'L': (0.13, -0.05, 0.09, 0), 'R': (-0.13, 0.08, 0.09, 0)}
def charge(t, T=1.0):
    p = keyed(rel([(0, CHARGE, 'lin')]), 0)
    w = 2 * math.pi * t / T
    p['Chest'] = add(p['Chest'], (0.8 * math.sin(w), 0, 0)); p['root'] = add(p['root'], (0, 0, 0.003 * math.sin(w)))
    for c in ('R_Arm', 'Chest', 'head'): p[c] = add(p[c], (0.6 * math.sin(t * 2 * math.pi * 11), 0.5 * math.sin(t * 2 * math.pi * 7), 0))
    return p, dict(CH_FEET)
ACT['charge'] = dict(T=1.0, loop=True, f=charge)


# 主炮开火：0.2 开火，被后坐顶退半步，慢慢站直
def cannon(t):
    k = [(0.00, CHARGE, 'smooth'),
         (0.20, dict(CHARGE, root=(0, 0.004, -0.06)), 'smooth'),
         (0.32, dict(CHARGE, root=(0, 0.05, -0.05), Hips=(-2, 0, 6), Spine=(-6, 0, 4), Chest=(-10, 0, 8), neck=(0, 0, -6),
                     R_Arm=(-84, 10, -6), R_ForeArm=(-30, 0, 0)), 'in3'),
         (0.55, dict(CHARGE, root=(0, 0.056, -0.04), Chest=(-8, 0, 6), R_Arm=(-72, 8, -6)), 'out'),
         (1.00, {}, 'smooth')]
    p = keyed(rel(k), t)
    v = ease(min(1, max(0, (t - 0.2) / 0.2)), 'out'); back = ease(max(0, (t - 0.55) / 0.45), 'smooth')
    f = {'L': lerpf(CH_FEET['L'], STANCE['L'], back), 'R': lerpf(CH_FEET['R'], STANCE['R'], back)}
    f['L'] = (f['L'][0], f['L'][1] + 0.06 * v * (1 - back) + 0.0, f['L'][2] + 0.025 * math.sin(math.pi * min(1, max(0, (t - 0.25) / 0.25))), f['L'][3])
    return p, f
ACT['cannon'] = dict(T=1.0, loop=False, f=cannon, hit=0.2)


# 半血破甲：身上一震（0.5 装甲飞出）→ 两手抱胸、往后退一步 → 站稳
def armor_break(t):
    k = [(0.00, {}, 'smooth'),
         (0.40, P(root=(0, -0.006, -0.03), Chest=(8, 0, 0), neck=(-6, 0, 0), R_Arm=(-10, 10, 0), L_Arm=(-10, -10, 0)), 'out'),
         (0.50, P(root=(0, 0.02, -0.02), Hips=(-4, 0, 0), Spine=(-8, 0, 0), Chest=(-14, 0, 0), neck=(8, 0, 0), head=(10, 0, 0),
                  R_Arm=(10, 30, 0), L_Arm=(10, -30, 0), pod_L=(-20, 0, 0), pod_R=(-20, 0, 0)), 'in3'),
         (0.90, P(root=(0, 0.04, -0.05), Hips=(10, 0, 0), Spine=(10, 0, 0), Chest=(14, 0, 0), neck=(-8, 0, 0), head=(-2, 0, 0),
                  R_Arm=(-56, -28, 0), R_ForeArm=(-80, 0, 0), L_Arm=(-56, 28, 0), L_ForeArm=(-96, 0, 0), pod_L=(0, 0, 0), pod_R=(0, 0, 0)), 'smooth'),
         (1.20, P(root=(0, 0.045, -0.04), Chest=(12, 0, 0)), 'smooth'),
         (1.60, P(root=(0, 0.045, -0.01)), 'smooth')]
    p = keyed(rel(k), t)
    if 0.45 < t < 1.0:
        a = math.sin(math.pi * (t - 0.45) / 0.55); p['Chest'] = add(p['Chest'], shake(t, 2.5 * a)); p['head'] = add(p['head'], shake(t, 2 * a, 51, 37))
    f = FEET(); u = ease(min(1, max(0, (t - 0.55) / 0.4)), 'smooth')
    x0, y0, z0, _ = STANCE['R']; f['R'] = (x0, y0 + 0.09 * u, z0 + 0.035 * math.sin(math.pi * u), 0)   # 往后退一步
    xl, yl, zl, _ = STANCE['L']; f['L'] = (xl, yl + 0.0, zl, 0)
    return p, f
ACT['armor_break'] = dict(T=1.6, loop=False, f=armor_break, hit=0.5)


def hit(t):
    k = [(0.00, {}, 'smooth'),
         (0.08, P(root=(0, 0.008, -0.012), Hips=(-2, 0, 2), Spine=(-3, 0, 2), Chest=(-5, 0, 3), neck=(4, 0, 0), head=(5, 0, 3)), 'out'),
         (0.40, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['hit'] = dict(T=0.4, loop=False, f=hit)


def stagger(t):
    k = [(0.00, {}, 'smooth'),
         (0.16, P(root=(0.01, 0.02, -0.03), Hips=(-4, -3, 6), Spine=(-6, -3, 4), Chest=(-9, -3, 8), neck=(6, 0, -4), head=(8, -4, -6),
                  R_Arm=(10, 14, 0), L_Arm=(14, -14, 0)), 'in'),
         (0.42, P(root=(-0.006, -0.008, -0.025), Hips=(6, 3, -4), Spine=(5, 3, -4), Chest=(6, 3, -6)), 'smooth'),
         (0.70, {}, 'smooth')]
    p = keyed(rel(k), t); f = FEET()
    if 0.06 < t < 0.42:
        u = math.sin(math.pi * (t - 0.06) / 0.36); x0, y0, z0, _ = STANCE['L']; f['L'] = (x0, y0 + 0.04 * u, z0 + 0.025 * u, 0)
    return p, f
ACT['stagger'] = dict(T=0.7, loop=False, f=stagger)


# 倒下：跪下 → 往前扑倒（核心灭掉开发1 做）
def die(t):
    k = [(0.00, {}, 'smooth'),
         (0.30, P(root=(0, 0.02, -0.02), Chest=(-8, 0, 4), neck=(6, 0, 0), head=(8, 0, 0), R_Arm=(8, 10, 0), L_Arm=(8, -10, 0)), 'out'),
         (0.90, dict(KNEEL, R_Arm=(2, 10, 0), R_ForeArm=(-4, 0, 0), L_Arm=(2, -10, 0), L_ForeArm=(-6, 0, 0), head=(10, 0, 0)), 'in'),
         (1.20, dict(KNEEL, root=(0, 0.02, -0.18), R_Arm=(2, 10, 0), L_Arm=(2, -10, 0), head=(12, 0, 0)), 'out'),
         (1.85, P(root=(0, -0.26, -0.34), Hips=(80, 0, 4), Spine=(6, 0, 0), Chest=(4, 0, 0), neck=(-12, 0, 6), head=(-16, 0, 14),
                  R_Arm=(-120, 16, -20), R_ForeArm=(-10, 0, 0), L_Arm=(-110, -16, 20), L_ForeArm=(-20, 0, 0), pod_L=(8, 0, 0), pod_R=(10, 0, 0)), 'in'),
         (2.00, P(root=(0, -0.265, -0.35), Hips=(83, 0, 4), pod_L=(4, 0, 0), pod_R=(6, 0, 0)), 'out'),
         (2.40, P(root=(0, -0.265, -0.35), Hips=(82, 0, 4)), 'smooth')]
    p = keyed(rel(k), t)
    u = ease(min(1, t / 0.9), 'smooth'); u2 = ease(min(1, max(0, (t - 1.2) / 0.65)), 'in')
    f = {s: lerpf(STANCE[s], KNEE_FEET[s], u) for s in ('L', 'R')}
    f = {s: (f[s][0], f[s][1] + 0.12 * u2, f[s][2], f[s][3] + 30 * u2) for s in ('L', 'R')}
    if t > 1.8:
        a = math.exp(-(t - 1.85) / 0.08) if t > 1.85 else 0; p['Chest'] = add(p['Chest'], (0, 2 * a * math.sin(t * 60), 0))
    return p, f
ACT['die'] = dict(T=2.4, loop=False, f=die, hit=1.85, shake=1.85)

ORDER = ['idle', 'walk', 'fire', 'sweep', 'missile', 'carpet', 'grid', 'kneel', 'kneel_loop', 'shield_break', 'pull', 'shotgun',
         'emp', 'charge', 'cannon', 'armor_break', 'hit', 'stagger', 'die']
