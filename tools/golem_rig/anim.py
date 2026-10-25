"""设计 102：落石巨人动作。关键帧 + 程序（腿 IK 防滑脚）；石拳（右手 R_*）在 bake.py 里用弹簧跟随：比身体晚到位、停下来晃一下。
坐标：Z 上，-Y 前，-X 是巨人右手（石化石拳）。角度用骨架轴：
  X 正：向上的骨头往前倾；向下的骨头往后摆（负 = 往前抬）。
  Y 正：向上的骨头往左（+X）歪；向下的骨头末端往 -X（右手往外张 = +，左手往外张 = -）。
  Z 正：往左转。
"""
import math
import sys
sys.path.insert(0, '/home/claude/fb3/rig')
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


CH = ['root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'R_Shoulder', 'R_Arm', 'R_ForeArm', 'R_Hand',
      'L_Shoulder', 'L_Arm', 'L_ForeArm', 'L_Hand']

# 基础站姿：驼背、微屈膝，石拳又大又沉垂在右前方
BASE = {
    'root': (0, 0.0, -0.016), 'Hips': (6, 0, 0), 'Spine': (6, 0, 0), 'Chest': (8, 0, 0), 'Neck': (-12, 0, 0), 'Head': (-6, 0, 0),
    'R_Shoulder': (0, 0, 0), 'R_Arm': (-6, 5, 0), 'R_ForeArm': (-10, 0, 0), 'R_Hand': (0, 0, 0),
    'L_Shoulder': (0, 0, 0), 'L_Arm': (4, -6, 0), 'L_ForeArm': (-14, 0, 0), 'L_Hand': (0, 0, 0),
}
STANCE = {'L': (0.18, 0.04, 0.06, 0), 'R': (-0.17, 0.04, 0.06, 0)}


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


P = dict
ACT = {}
FEET = lambda: {'L': STANCE['L'], 'R': STANCE['R']}


# 待机：慢呼吸，重心左右换，石拳被弹簧带着轻轻晃
def idle(t, T=3.2):
    w = 2 * math.pi * t / T; sh = math.sin(w); br = math.sin(2 * w)
    p = {'root': (0.010 * sh, 0, -0.016 - 0.005 * (0.5 + 0.5 * math.sin(2 * w - 1.2))),
         'Hips': (6, -2.5 * sh, 2 * sh), 'Spine': (6 + 1.0 * br, 1.5 * sh, 0), 'Chest': (8 + 2.0 * br, 1.2 * sh, -2 * sh),
         'Neck': (-12 - 1.5 * br, 0, 0), 'Head': (-6 - 1 * br, 0, 0),
         'R_Arm': (-6 + 2 * br, 5, 0), 'L_Arm': (4 + 2 * math.sin(2 * w + .6), -6, 0), 'L_ForeArm': (-14 + 3 * br, 0, 0)}
    return p, FEET()
ACT['idle'] = dict(T=3.2, loop=True, f=idle)


def gait(t, T, step, lift, drop, lean, bob, stanceFrac, armR, armL):
    out = {}; ph = (t / T) % 1.0
    for side, off in (('L', 0.0), ('R', 0.5)):
        q = (ph + off) % 1.0; x0, y0, z0, _ = STANCE[side]
        if q < stanceFrac:
            u = q / stanceFrac; y = y0 - step + 2 * step * u; z = z0; pitch = -10 * (1 - u) ** 6 + 24 * max(0, u - 0.75) / 0.25 * 0.6
        else:
            u = (q - stanceFrac) / (1 - stanceFrac); s = u * u * (3 - 2 * u)
            y = y0 + step - 2 * step * s; z = z0 + lift * math.sin(math.pi * u) ** 1.2; pitch = 14 * (1 - u) ** 2 - 12 * u ** 3
        out[side] = (x0, y, z, pitch)

    def contact(phase):
        d = (ph - phase) % 1.0
        return math.exp(-((d - 0.08) / 0.07) ** 2) if d < 0.5 else 0
    sink = contact(0.0) + contact(0.5)   # 每一步落地重重一沉
    side = math.sin(2 * math.pi * ph); sw = side
    z = -0.016 - drop - bob * sink
    p = {'root': (0.018 * side, 0, z),   # 重心左右摆得大（体重大、走路晃）
         'Hips': (6 + lean * 0.5, -5 * side, 6 * sw), 'Spine': (6 + lean * 0.3, 2.5 * side, -3 * sw),
         'Chest': (8 + lean * 0.3 + 3 * sink, 2 * side, -6 * sw), 'Neck': (-12 - lean * 0.6, 0, 2.5 * sw), 'Head': (-6 - lean * 0.3, 0, 2 * sw),
         'R_Arm': (-6 - armR * sw, 6, 0), 'R_ForeArm': (-12, 0, 0),         # 石拳摆得小、慢（重）
         'L_Arm': (4 + armL * sw, -6, 0), 'L_ForeArm': (-16 + armL * 0.3 * (1 + sw), 0, 0)}
    return p, out

WALK = dict(T=1.5, step=0.085, lift=0.04, drop=0.010, lean=6, bob=0.016, stanceFrac=0.64, armR=6, armL=16)
ACT['walk'] = dict(T=WALK['T'], loop=True, f=lambda t: gait(t, **WALK), speed=2 * WALK['step'] / (WALK['T'] * WALK['stanceFrac']))
FAST = dict(T=1.12, step=0.10, lift=0.05, drop=0.016, lean=12, bob=0.020, stanceFrac=0.6, armR=9, armL=22)
ACT['walk_fast'] = dict(T=FAST['T'], loop=True, f=lambda t: gait(t, **FAST), speed=2 * FAST['step'] / (FAST['T'] * FAST['stanceFrac']))


# 石拳横扫：0～0.8 秒预警（身子往右拧、石拳往右后拉开）→ 0.8 扫过身前 → 收
def sweep(t):
    k = [(0.00, {}, 'smooth'),
         (0.62, P(root=(0.012, 0.012, -0.03), Hips=(4, 2, -18), Spine=(2, 2, -16), Chest=(0, 2, -22), Neck=(-8, 0, 16), Head=(-6, 0, 12),
                  R_Arm=(10, 50, -10), R_ForeArm=(-30, 0, 0), L_Arm=(-24, -10, 18), L_ForeArm=(-30, 0, 0)), 'out'),
         (0.72, P(root=(0.012, 0.012, -0.032), Chest=(-2, 2, -25), R_Arm=(12, 54, -12)), 'smooth'),
         (0.82, P(root=(-0.012, -0.02, -0.045), Hips=(10, -3, 18), Spine=(10, -2, 16), Chest=(12, -3, 24), Neck=(-14, 0, -10), Head=(-6, 0, -8),
                  R_Arm=(-84, 0, 42), R_ForeArm=(-16, 0, 0), L_Arm=(18, -8, -10), L_ForeArm=(-10, 0, 0)), 'in3'),
         (1.02, P(root=(-0.014, -0.022, -0.048), Chest=(13, -3, 28), R_Arm=(-74, 0, 66)), 'out'),
         (1.70, {}, 'smooth')]
    return keyed(rel(k), t), {'L': STANCE['L'], 'R': (-0.17, 0.06, 0.06, 0)}
ACT['sweep'] = dict(T=1.70, loop=False, f=sweep, hit=0.8, warn=0.8)


# 抠石头投掷（主角在 4 米外）：弯腰左手抠地 → 举过头 → 0.8 扔出
def throw(t):
    k = [(0.00, {}, 'smooth'),
         (0.32, P(root=(0.01, -0.01, -0.06), Hips=(20, 0, 8), Spine=(14, 0, 4), Chest=(14, 4, 6), Neck=(-18, 0, 0),
                  L_Arm=(-50, -8, 0), L_ForeArm=(-12, 0, 0), R_Arm=(-14, 10, 0)), 'out'),
         (0.62, P(root=(0, 0.02, -0.01), Hips=(-2, 0, -10), Spine=(-6, 0, -8), Chest=(-10, -2, -12), Neck=(4, 0, 6), Head=(4, 0, 4),
                  L_Arm=(-168, -6, -10), L_ForeArm=(-70, 0, 0), R_Arm=(-10, 14, 0)), 'smooth'),
         (0.70, P(root=(0, 0.024, -0.008), Chest=(-12, -2, -14), L_Arm=(-176, -6, -12)), 'smooth'),
         (0.80, P(root=(0, -0.02, -0.04), Hips=(10, 0, 8), Spine=(12, 0, 8), Chest=(16, 2, 12), Neck=(-16, 0, 0),
                  L_Arm=(-60, -4, 10), L_ForeArm=(-6, 0, 0), R_Arm=(4, 6, 0)), 'in3'),
         (1.00, P(root=(0, -0.024, -0.045), Chest=(18, 2, 14), L_Arm=(-40, -4, 12)), 'out'),
         (1.60, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['throw'] = dict(T=1.60, loop=False, f=throw, hit=0.8, warn=0.8)


# 弯腰抓掩体（1 秒，可打断）：两手往前下抓 → 举到胸前（结尾停在这个姿势，接 toss）
GRAB_END = P(root=(0, 0.01, -0.02), Hips=(0, 0, 0), Spine=(-4, 0, 0), Chest=(-8, 0, 0), Neck=(-2, 0, 0), Head=(0, 0, 0),
             R_Arm=(-120, -18, 0), R_ForeArm=(-60, 0, 0), L_Arm=(-120, 18, 0), L_ForeArm=(-60, 0, 0))
def grab(t):
    k = [(0.00, {}, 'smooth'),
         (0.50, P(root=(0, -0.03, -0.09), Hips=(28, 0, 0), Spine=(20, 0, 0), Chest=(18, 0, 0), Neck=(-20, 0, 0),
                  R_Arm=(-58, -6, 0), R_ForeArm=(-10, 0, 0), L_Arm=(-58, 6, 0), L_ForeArm=(-10, 0, 0)), 'out'),
         (0.62, P(root=(0, -0.03, -0.095), Hips=(30, 0, 0), R_Arm=(-60, -8, 0), L_Arm=(-60, 8, 0)), 'smooth'),
         (1.00, GRAB_END, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['grab'] = dict(T=1.0, loop=False, f=grab, warn=1.0)


# 扔掩体：举过头往后拉（1.5 秒预警）→ 1.5 往前扔出 → 收
def toss(t):
    k = [(0.00, GRAB_END, 'smooth'),
         (1.10, P(root=(0, 0.03, 0.0), Hips=(-6, 0, 0), Spine=(-12, 0, 0), Chest=(-16, 0, 0), Neck=(6, 0, 0), Head=(4, 0, 0),
                  R_Arm=(-172, -12, 0), R_ForeArm=(-40, 0, 0), L_Arm=(-172, 12, 0), L_ForeArm=(-40, 0, 0)), 'smooth'),
         (1.36, P(root=(0, 0.036, 0.002), Spine=(-14, 0, 0), Chest=(-18, 0, 0), R_Arm=(-178, -12, 0), L_Arm=(-178, 12, 0)), 'smooth'),
         (1.50, P(root=(0, -0.03, -0.06), Hips=(16, 0, 0), Spine=(18, 0, 0), Chest=(20, 0, 0), Neck=(-18, 0, 0),
                  R_Arm=(-50, -4, 0), R_ForeArm=(-10, 0, 0), L_Arm=(-50, 4, 0), L_ForeArm=(-10, 0, 0)), 'in3'),
         (1.75, P(root=(0, -0.034, -0.065), Chest=(22, 0, 0), R_Arm=(-30, 0, 0), L_Arm=(-30, 0, 0)), 'out'),
         (2.40, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['toss'] = dict(T=2.4, loop=False, f=toss, hit=1.5, warn=1.5)


# 双拳砸地（地裂）：两手高举 → 1.5 砸到地 → 压住
def pound(t):
    k = [(0.00, {}, 'smooth'),
         (0.30, P(root=(0, 0.01, -0.05), Hips=(12, 0, 0), Spine=(10, 0, 0), Chest=(10, 0, 0), Neck=(-16, 0, 0),
                  R_Arm=(20, 4, 0), R_ForeArm=(-30, 0, 0), L_Arm=(20, -4, 0), L_ForeArm=(-30, 0, 0)), 'out'),
         (1.00, P(root=(0, 0.02, 0.006), Hips=(-6, 0, 0), Spine=(-10, 0, 0), Chest=(-14, 0, 0), Neck=(6, 0, 0), Head=(6, 0, 0),
                  R_Arm=(-170, -10, 0), R_ForeArm=(-50, 0, 0), L_Arm=(-170, 10, 0), L_ForeArm=(-50, 0, 0)), 'smooth'),
         (1.34, P(root=(0, 0.024, 0.01), Spine=(-12, 0, 0), Chest=(-16, 0, 0), R_Arm=(-176, -10, 0), L_Arm=(-176, 10, 0)), 'smooth'),
         (1.50, P(root=(0, -0.03, -0.11), Hips=(26, 0, 0), Spine=(22, 0, 0), Chest=(26, 0, 0), Neck=(-22, 0, 0), Head=(-8, 0, 0),
                  R_Arm=(-62, -4, 0), R_ForeArm=(-18, 0, 0), L_Arm=(-62, 4, 0), L_ForeArm=(-18, 0, 0)), 'in3'),
         (1.90, P(root=(0, -0.032, -0.114), Hips=(27, 0, 0), Chest=(28, 0, 0)), 'out'),
         (2.70, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['pound'] = dict(T=2.7, loop=False, f=pound, hit=1.5, warn=1.5)


# 跺地（石柱阵起手）：右脚高抬、石拳也举起 → 1.5 重重跺下
def stomp(t):
    k = [(0.00, {}, 'smooth'),
         (1.10, P(root=(0.03, 0.01, 0.02), Hips=(-2, 6, 0), Spine=(-4, -4, 0), Chest=(-6, -4, 0), Neck=(4, 0, 0),
                  R_Arm=(-110, 30, 0), R_ForeArm=(-60, 0, 0), L_Arm=(-30, -30, 0), L_ForeArm=(-30, 0, 0)), 'smooth'),
         (1.36, P(root=(0.034, 0.012, 0.026), Chest=(-8, -5, 0), R_Arm=(-118, 32, 0)), 'smooth'),
         (1.50, P(root=(0, -0.01, -0.07), Hips=(14, 0, 0), Spine=(14, 0, 0), Chest=(18, 0, 0), Neck=(-20, 0, 0),
                  R_Arm=(-40, 10, 0), R_ForeArm=(-20, 0, 0), L_Arm=(0, -12, 0), L_ForeArm=(-20, 0, 0)), 'in3'),
         (1.85, P(root=(0, -0.012, -0.074), Chest=(20, 0, 0)), 'out'),
         (2.50, {}, 'smooth')]
    p = keyed(rel(k), t); f = FEET()
    if t < 1.5:
        u = math.sin(math.pi / 2 * min(1, t / 1.1)) if t < 1.36 else max(0, 1 - (t - 1.36) / 0.14)
        x0, y0, z0, _ = STANCE['R']; f['R'] = (x0 - 0.02 * u, y0 - 0.06 * u, z0 + 0.14 * u, -10 * u)
    return p, f
ACT['stomp'] = dict(T=2.5, loop=False, f=stomp, hit=1.5, warn=1.5)


# 山崩：举起石拳仰天吼（红色施法条 2 秒）→ 2.0 石拳砸向天、吼 → 收
def roar(t):
    k = [(0.00, {}, 'smooth'),
         (0.60, P(root=(0, 0.01, -0.06), Hips=(14, 0, 0), Spine=(12, 0, 0), Chest=(14, 0, 0), Neck=(-14, 0, 0),
                  R_Arm=(10, 20, 0), R_ForeArm=(-60, 0, 0), L_Arm=(10, -20, 0), L_ForeArm=(-70, 0, 0)), 'out'),   # 缩身蓄力
         (1.60, P(root=(0, 0.02, 0.01), Hips=(-6, 0, 0), Spine=(-14, 0, 0), Chest=(-20, 0, 0), Neck=(12, 0, 0), Head=(14, 0, 0),
                  R_Arm=(-176, 12, 0), R_ForeArm=(-10, 0, 0), L_Arm=(-60, -60, 0), L_ForeArm=(-40, 0, 0)), 'smooth'),  # 石拳举天
         (2.00, P(root=(0, 0.024, 0.012), Chest=(-24, 0, 0), Neck=(16, 0, 0), Head=(18, 0, 0), R_Arm=(-180, 10, 0)), 'smooth'),
         (2.40, P(root=(0, 0.024, 0.012), Chest=(-24, 0, 0)), 'smooth'),
         (3.10, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 1.7 < t < 2.5:
        a = math.sin(math.pi * (t - 1.7) / 0.8)
        p['Head'] = add(p['Head'], (3 * a * math.sin(t * 70), 0, 3 * a * math.sin(t * 53)))
        p['Chest'] = add(p['Chest'], (1.5 * a * math.sin(t * 61), 1.5 * a * math.sin(t * 47), 0))
    return p, FEET()
ACT['roar'] = dict(T=3.1, loop=False, f=roar, hit=2.0, warn=2.0)


def hit(t):
    k = [(0.00, {}, 'smooth'),
         (0.09, P(root=(0, 0.012, -0.012), Hips=(-3, 0, 3), Spine=(-5, 0, 3), Chest=(-7, 0, 4), Neck=(8, 0, 0), Head=(8, 0, 4)), 'out'),
         (0.50, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['hit'] = dict(T=0.5, loop=False, f=hit)


# 被打断：砸空、往前踉跄、晃一下站稳
def stagger(t):
    k = [(0.00, {}, 'smooth'),
         (0.18, P(root=(-0.01, -0.03, -0.07), Hips=(22, -4, 8), Spine=(16, -4, 6), Chest=(18, -4, 10), Neck=(-20, 0, 0),
                  R_Arm=(-40, -10, 30), R_ForeArm=(-20, 0, 0), L_Arm=(10, -20, 0)), 'in'),
         (0.55, P(root=(0.012, -0.02, -0.05), Hips=(12, 4, -6), Spine=(8, 4, -6), Chest=(8, 4, -8), Neck=(-10, 0, 8), Head=(-4, 0, 10)), 'smooth'),
         (0.85, P(root=(-0.006, -0.01, -0.03), Hips=(8, -2, 4), Chest=(9, -2, 4)), 'smooth'),
         (1.30, {}, 'smooth')]
    p = keyed(rel(k), t); f = FEET()
    if 0.1 < t < 0.6:
        u = math.sin(math.pi * (t - 0.1) / 0.5); x0, y0, z0, _ = STANCE['R']; f['R'] = (x0, y0 - 0.07 * u, z0 + 0.04 * u, 10 * u)
    return p, f
ACT['stagger'] = dict(T=1.3, loop=False, f=stagger)


# 半血裂开（设计 102b 重做）：身子往后一抽、头扭向石化那一侧，石拳往下一坠，抖两下站稳。
# 以前左手横过胸口去捂、身子前倾近 70°，权重扯得身体揉成一团；现在每个关节都只动一点（总前倾不超过站姿 +10°），左手不过中线
def crack(t):
    k = [(0.00, {}, 'smooth'),
         (0.30, P(root=(0.0, 0.01, -0.02), Hips=(-4, 0, -3), Spine=(-4, -2, -5), Chest=(-6, -3, -7), Neck=(4, 0, -6), Head=(6, -4, -10),
                  R_Arm=(8, 8, 0), R_ForeArm=(4, 0, 0), L_Arm=(-16, -16, 0), L_ForeArm=(-18, 0, 0)), 'out'),
         (0.70, P(root=(0.0, -0.005, -0.04), Hips=(6, 0, -2), Spine=(5, -2, -4), Chest=(6, -3, -6), Neck=(0, 0, -4), Head=(4, -3, -8),
                  R_Arm=(14, 12, 0), R_ForeArm=(6, 0, 0), L_Arm=(-10, -20, 0), L_ForeArm=(-14, 0, 0)), 'in'),
         (1.40, P(root=(0.0, 0, -0.02), Hips=(2, 0, 0), Spine=(0, 0, 0), Chest=(-4, 0, 0), Neck=(6, 0, 0), Head=(8, 0, 0),
                  R_Arm=(-6, 8, 0), R_ForeArm=(-8, 0, 0), L_Arm=(-12, -22, 0), L_ForeArm=(-16, 0, 0)), 'smooth'),
         (2.10, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 0.3 < t < 1.6:
        a = math.sin(math.pi * (t - 0.3) / 1.3)
        p['Chest'] = add(p['Chest'], (1.5 * a * math.sin(t * 57), 1.5 * a * math.sin(t * 43), 0))
        p['Head'] = add(p['Head'], (2 * a * math.sin(t * 67), 0, 2 * a * math.sin(t * 49)))
    return p, FEET()
ACT['crack'] = dict(T=2.1, loop=False, f=crack, hit=0.7)


def die(t):
    k = [(0.00, {}, 'smooth'),
         (0.40, P(root=(0.01, 0.03, -0.02), Hips=(-6, 6, 8), Spine=(-8, 4, 6), Chest=(-10, 4, 8), Neck=(12, 0, 0), Head=(14, 0, 10),
                  R_Arm=(20, 10, -10), L_Arm=(24, -10, 20)), 'out'),
         (1.05, P(root=(0.0, -0.01, -0.15), Hips=(18, 4, 4), Spine=(14, 0, 0), Chest=(14, 0, 0), Neck=(-8, 0, 0), Head=(4, 0, 0),
                  R_Arm=(-10, 6, -12), R_ForeArm=(-10, 0, 0), L_Arm=(10, -6, 10)), 'in'),
         (1.35, P(root=(0.0, -0.01, -0.16), Hips=(20, 4, 4)), 'out'),
         (1.95, P(root=(0.0, -0.22, -0.27), Hips=(84, 6, 6), Spine=(6, 0, 0), Chest=(4, 0, 0), Neck=(-10, 0, 10), Head=(-10, 0, 20),
                  R_Arm=(-120, 10, -30), R_ForeArm=(-10, 0, 0), L_Arm=(-110, -10, 30), L_ForeArm=(-20, 0, 0)), 'in'),
         (2.15, P(root=(0.0, -0.225, -0.275), Hips=(86, 6, 6), Head=(-14, 0, 22)), 'out'),
         (2.70, P(root=(0.0, -0.225, -0.275), Hips=(86, 6, 6), Head=(-12, 0, 22)), 'smooth')]
    p = keyed(rel(k), t)
    u = min(1, max(0, (t - 0.5) / 0.6)); u2 = min(1, max(0, (t - 1.4) / 0.6))
    return p, {'L': (0.18, 0.04 + 0.04 * u2, 0.06 - 0.01 * u, 35 * u + 20 * u2), 'R': (-0.17, 0.04 + 0.05 * u2, 0.06 - 0.01 * u, 35 * u + 20 * u2)}
ACT['die'] = dict(T=2.7, loop=False, f=die, hit=1.95, shake=1.95)

ORDER = ['idle', 'walk', 'walk_fast', 'sweep', 'throw', 'grab', 'toss', 'pound', 'stomp', 'roar', 'hit', 'stagger', 'crack', 'die']
