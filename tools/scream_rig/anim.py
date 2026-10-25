"""设计 114B：尖啸者动作（13 个，名字照 114 第 2 节）。做法跟落石巨人一样：关键帧 + 程序（腿 IK 防滑脚），
手、手指在 bake.py 里用弹簧跟。瘦长、驼背、关节僵硬；站着上身轻晃、手指抽动；尖叫时下巴（jaw）张到最大。
坐标：Z 上，-Y 前，-X 是它的右手。角度用骨架轴：
  X 正：向上的骨头往前倾；向下的骨头往后摆（负 = 往前抬）。下巴 jaw：X 正 = 张嘴。手指 X 负 = 往里勾。
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


CH = ['root', 'Hips', 'Spine', 'Chest', 'neck', 'head', 'jaw', 'R_Shoulder', 'R_Arm', 'R_ForeArm', 'R_Hand', 'R_Fingers',
      'L_Shoulder', 'L_Arm', 'L_ForeArm', 'L_Hand', 'L_Fingers']

# 站姿：驼背、头往前探、长手垂着往里收一点、手指半勾
BASE = {
    'root': (0, 0.0, -0.012), 'Hips': (4, 0, 0), 'Spine': (8, 0, 0), 'Chest': (12, 0, 0), 'neck': (-6, 0, 0), 'head': (-12, 0, 0), 'jaw': (4, 0, 0),
    'R_Shoulder': (0, 0, 0), 'R_Arm': (-6, -8, 0), 'R_ForeArm': (-14, 0, 0), 'R_Hand': (-4, 0, 0), 'R_Fingers': (-18, 0, 0),
    'L_Shoulder': (0, 0, 0), 'L_Arm': (-6, 8, 0), 'L_ForeArm': (-14, 0, 0), 'L_Hand': (-4, 0, 0), 'L_Fingers': (-18, 0, 0),
}
STANCE = {'L': (0.09, 0.02, 0.065, 0), 'R': (-0.09, 0.02, 0.065, 0)}


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


def twitch(t, seed, amp):
    """手指抽动：大部分时间不动，偶尔猛地一抽"""
    s = 0.0
    for k, (f, ph) in enumerate(((1.7, seed), (2.9, seed * 1.7 + 1), (4.3, seed * 2.3 + 2))):
        v = math.sin(2 * math.pi * f * t / 2.4 * 2.4 + ph)
        s += max(0.0, v) ** 8 * (1 - 0.3 * k)
    return amp * s


def shake(t, a, f1=63, f2=47):
    return (a * math.sin(t * f1), a * math.sin(t * f2 + 1.3), 0)


P = dict
ACT = {}
FEET = lambda: {'L': STANCE['L'], 'R': STANCE['R']}


# 待机 2.4 秒循环：上身轻晃、头微歪、手指一抽一抽
def idle(t, T=2.4):
    w = 2 * math.pi * t / T; sh = math.sin(w); br = math.sin(2 * w)
    p = keyed(rel([(0, {}, 'lin')]), 0)
    p['root'] = (0.006 * sh, 0, -0.012 - 0.003 * (0.5 + 0.5 * math.sin(2 * w - 1)))
    p['Hips'] = add(p['Hips'], (0, -1.5 * sh, 1.5 * sh))
    p['Spine'] = add(p['Spine'], (1.0 * br, 2.0 * sh, 0))
    p['Chest'] = add(p['Chest'], (1.5 * br, 2.0 * sh, -3 * sh))
    p['neck'] = add(p['neck'], (-1 * br, -1.5 * sh, 2 * math.sin(w + 0.8)))
    p['head'] = add(p['head'], (-1 * br, 8 + 3 * math.sin(w + 0.4), 3 * math.sin(w + 1.6)))   # 头歪着
    p['jaw'] = add(p['jaw'], (2 + 2 * math.sin(2 * w + 0.5), 0, 0))
    p['R_Arm'] = add(p['R_Arm'], (2 * math.sin(w + 0.6), 0, 0)); p['L_Arm'] = add(p['L_Arm'], (2 * math.sin(w + 2.2), 0, 0))
    p['R_Fingers'] = add(p['R_Fingers'], (-twitch(t, 0.3, 22), 0, 0)); p['L_Fingers'] = add(p['L_Fingers'], (-twitch(t + 0.9, 2.1, 22), 0, 0))
    p['R_Hand'] = add(p['R_Hand'], (-twitch(t + 0.4, 1.1, 8), 0, 0)); p['L_Hand'] = add(p['L_Hand'], (-twitch(t + 1.5, 0.7, 8), 0, 0))
    return p, FEET()
ACT['idle'] = dict(T=2.4, loop=True, f=idle)


# 慢走 1.2 秒循环：步子小、膝盖僵、上身前探，长手几乎不摆（吊着晃）
def gait(t, T, step, lift, drop, lean, bob, stanceFrac, arm):
    out = {}; ph = (t / T) % 1.0
    for side, off in (('L', 0.0), ('R', 0.5)):
        q = (ph + off) % 1.0; x0, y0, z0, _ = STANCE[side]
        if q < stanceFrac:
            u = q / stanceFrac; y = y0 - step + 2 * step * u; z = z0; pitch = -8 * (1 - u) ** 6 + 20 * max(0, u - 0.75) / 0.25 * 0.6
        else:
            u = (q - stanceFrac) / (1 - stanceFrac); s = u * u * (3 - 2 * u)
            y = y0 + step - 2 * step * s; z = z0 + lift * math.sin(math.pi * u) ** 1.2; pitch = 12 * (1 - u) ** 2 - 10 * u ** 3
        out[side] = (x0, y, z, pitch)
    side = math.sin(2 * math.pi * ph); sw = side; up = abs(math.cos(2 * math.pi * ph))
    p = keyed(rel([(0, {}, 'lin')]), 0)
    p['root'] = (0.010 * side, 0, -0.012 - drop - bob * (1 - up))
    p['Hips'] = add(p['Hips'], (lean * 0.3, -3 * side, 5 * sw))
    p['Spine'] = add(p['Spine'], (lean * 0.3, 2 * side, -3 * sw)); p['Chest'] = add(p['Chest'], (lean * 0.4, 2 * side, -4 * sw))
    p['neck'] = add(p['neck'], (-lean * 0.5, 0, 2 * sw)); p['head'] = add(p['head'], (-lean * 0.4, 6, 2 * sw))
    p['R_Arm'] = add(p['R_Arm'], (-arm * sw, 0, 0)); p['L_Arm'] = add(p['L_Arm'], (arm * sw, 0, 0))
    p['R_Fingers'] = add(p['R_Fingers'], (-twitch(t, 0.3, 14), 0, 0)); p['L_Fingers'] = add(p['L_Fingers'], (-twitch(t + 0.5, 2.1, 14), 0, 0))
    return p, out

WALK = dict(T=1.2, step=0.05, lift=0.03, drop=0.008, lean=6, bob=0.008, stanceFrac=0.62, arm=7)
ACT['walk'] = dict(T=WALK['T'], loop=True, f=lambda t: gait(t, **WALK), speed=2 * WALK['step'] / (WALK['T'] * WALK['stanceFrac']))


# 鸦弹：右手抬到肩后（手心朝前、手指张开）→ 0.5 往前一甩出手 → 收
def throw(t):
    k = [(0.00, {}, 'smooth'),
         (0.36, P(root=(0.006, 0.01, -0.016), Hips=(0, 0, -8), Spine=(-2, 0, -8), Chest=(-4, 2, -14), neck=(0, 0, 8), head=(0, 0, 8),
                  R_Shoulder=(0, 0, 0), R_Arm=(-100, 30, 0), R_ForeArm=(-80, 0, 0), R_Hand=(20, 0, 0), R_Fingers=(10, 0, 0),
                  L_Arm=(-14, -10, 0)), 'out'),
         (0.43, P(root=(0.006, 0.012, -0.016), Chest=(-5, 2, -16), R_Arm=(-106, 34, 0)), 'smooth'),
         (0.50, P(root=(-0.004, -0.014, -0.024), Hips=(6, 0, 6), Spine=(6, 0, 6), Chest=(10, -2, 12), neck=(-4, 0, -6), head=(0, 0, -4),
                  R_Arm=(-80, 6, 10), R_ForeArm=(-4, 0, 0), R_Hand=(0, 0, 0), R_Fingers=(14, 0, 0), L_Arm=(4, -6, 0)), 'in3'),
         (0.62, P(root=(-0.005, -0.016, -0.026), Chest=(12, -2, 14), R_Arm=(-62, 2, 14), R_Fingers=(4, 0, 0)), 'out'),
         (0.90, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['throw'] = dict(T=0.9, loop=False, f=throw, hit=0.5)


# 鸦群喷射：两手收到胸前 → 0.45 双手往前一推到最前（手指张开）→ 收
def push(t):
    k = [(0.00, {}, 'smooth'),
         (0.30, P(root=(0, 0.014, -0.02), Hips=(-2, 0, 0), Spine=(-4, 0, 0), Chest=(-6, 0, 0), neck=(4, 0, 0),
                  R_Arm=(-50, 20, 0), R_ForeArm=(-110, 0, 0), R_Hand=(30, 0, 0), L_Arm=(-50, -20, 0), L_ForeArm=(-110, 0, 0), L_Hand=(30, 0, 0)), 'out'),
         (0.45, P(root=(0, -0.022, -0.03), Hips=(8, 0, 0), Spine=(8, 0, 0), Chest=(12, 0, 0), neck=(-8, 0, 0), head=(-6, 0, 0), jaw=(14, 0, 0),
                  R_Arm=(-84, 4, 0), R_ForeArm=(-6, 0, 0), R_Hand=(40, 0, 0), R_Fingers=(24, 0, 0),
                  L_Arm=(-84, -4, 0), L_ForeArm=(-6, 0, 0), L_Hand=(40, 0, 0), L_Fingers=(24, 0, 0)), 'in3'),
         (0.56, P(root=(0, -0.024, -0.032), R_Arm=(-88, 4, 0), L_Arm=(-88, -4, 0)), 'out'),
         (0.80, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['push'] = dict(T=0.8, loop=False, f=push, hit=0.45)


# 乌鸦群：缩一下 → 1.0 张开双臂到最开（胸口挺出来、头仰）→ 停一下 → 收
def spread(t):
    k = [(0.00, {}, 'smooth'),
         (0.40, P(root=(0, 0.004, -0.03), Hips=(6, 0, 0), Spine=(8, 0, 0), Chest=(10, 0, 0), neck=(-4, 0, 0),
                  R_Arm=(-30, -20, 0), R_ForeArm=(-80, 0, 0), L_Arm=(-30, 20, 0), L_ForeArm=(-80, 0, 0)), 'out'),
         (1.00, P(root=(0, 0.012, 0.004), Hips=(-4, 0, 0), Spine=(-8, 0, 0), Chest=(-14, 0, 0), neck=(-2, 0, 0), head=(-6, 0, 0), jaw=(18, 0, 0),
                  R_Arm=(-50, 72, 0), R_ForeArm=(-8, 0, 0), R_Hand=(10, 0, 0), R_Fingers=(22, 0, 0),
                  L_Arm=(-50, -72, 0), L_ForeArm=(-8, 0, 0), L_Hand=(10, 0, 0), L_Fingers=(22, 0, 0)), 'smooth'),
         (1.12, P(root=(0, 0.012, 0.004), R_Arm=(-48, 76, 0), L_Arm=(-48, -76, 0)), 'smooth'),
         (1.40, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 0.9 < t < 1.3:
        a = math.sin(math.pi * (t - 0.9) / 0.4)
        for c in ('R_Fingers', 'L_Fingers'): p[c] = add(p[c], shake(t, 5 * a))
    return p, FEET()
ACT['spread'] = dict(T=1.4, loop=False, f=spread, hit=1.0)


# 尖叫：缩身吸气 → 仰头、两手往后张，下巴越张越大，1.2 叫到最响（全身抖）→ 收
def scream(t):
    k = [(0.00, {}, 'smooth'),
         (0.45, P(root=(0, 0.006, -0.03), Hips=(8, 0, 0), Spine=(10, 0, 0), Chest=(12, 0, 0), neck=(-4, 0, 0), head=(4, 0, 0), jaw=(-2, 0, 0),
                  R_Arm=(-20, -14, 0), R_ForeArm=(-50, 0, 0), L_Arm=(-20, 14, 0), L_ForeArm=(-50, 0, 0)), 'out'),
         (0.95, P(root=(0, 0.016, 0.0), Hips=(-4, 0, 0), Spine=(-10, 0, 0), Chest=(-18, 0, 0), neck=(-14, 0, 0), head=(-20, 0, 0), jaw=(30, 0, 0),
                  R_Arm=(24, 36, 0), R_ForeArm=(-24, 0, 0), R_Fingers=(20, 0, 0), L_Arm=(24, -36, 0), L_ForeArm=(-24, 0, 0), L_Fingers=(20, 0, 0)), 'smooth'),
         (1.20, P(root=(0, 0.018, 0.002), Chest=(-20, 0, 0), neck=(-16, 0, 0), head=(-24, 0, 0), jaw=(36, 0, 0), R_Arm=(28, 40, 0), L_Arm=(28, -40, 0)), 'smooth'),
         (1.36, P(jaw=(32, 0, 0)), 'smooth'),
         (1.60, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 0.8 < t < 1.45:
        a = math.sin(math.pi * (t - 0.8) / 0.65)
        p['head'] = add(p['head'], shake(t, 3 * a)); p['Chest'] = add(p['Chest'], shake(t, 1.5 * a, 57, 41))
        for c in ('R_Fingers', 'L_Fingers', 'R_Hand', 'L_Hand'): p[c] = add(p[c], shake(t + len(c), 6 * a))
    return p, FEET()
ACT['scream'] = dict(T=1.6, loop=False, f=scream, hit=1.2)


# 喇叭音爆：身子往左拧、往前探，对着一边尖叫（开发1 先把整个人转向喇叭），1.2 最响
def horn(t):
    k = [(0.00, {}, 'smooth'),
         (0.50, P(root=(0.01, 0.006, -0.03), Hips=(4, 0, 14), Spine=(4, 4, 12), Chest=(4, 4, 16), neck=(0, 0, 8), head=(6, 0, 6), jaw=(0, 0, 0),
                  R_Arm=(-30, -14, 0), R_ForeArm=(-60, 0, 0), L_Arm=(14, -20, 0), L_ForeArm=(-30, 0, 0)), 'out'),
         (1.00, P(root=(-0.006, -0.02, -0.04), Hips=(10, 0, 20), Spine=(12, -4, 18), Chest=(16, -4, 22), neck=(-16, 0, 10), head=(-16, 6, 8), jaw=(30, 0, 0),
                  R_Arm=(10, 30, 0), R_ForeArm=(-20, 0, 0), R_Fingers=(20, 0, 0), L_Arm=(20, -30, 0), L_ForeArm=(-20, 0, 0), L_Fingers=(20, 0, 0)), 'smooth'),
         (1.20, P(root=(-0.008, -0.024, -0.042), Chest=(18, -4, 24), head=(-18, 6, 8), jaw=(36, 0, 0)), 'smooth'),
         (1.40, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 0.95 < t < 1.35:
        a = math.sin(math.pi * (t - 0.95) / 0.4); p['head'] = add(p['head'], shake(t, 3 * a))
    return p, FEET()
ACT['horn'] = dict(T=1.4, loop=False, f=horn, hit=1.2)


# 闪现消失：一下子缩成一团（弯腰、两手抱紧、膝盖弯），开发1 叠烟 + 缩放到 0
VAN = P(root=(0, 0.01, -0.09), Hips=(20, 0, 0), Spine=(22, 0, 0), Chest=(24, 0, 0), neck=(-6, 0, 0), head=(-4, 0, 0), jaw=(-4, 0, 0),
        R_Arm=(-50, -26, 0), R_ForeArm=(-120, 0, 0), R_Fingers=(-30, 0, 0), L_Arm=(-50, 26, 0), L_ForeArm=(-120, 0, 0), L_Fingers=(-30, 0, 0))
def vanish(t):
    return keyed(rel([(0.00, {}, 'smooth'), (0.25, VAN, 'out')]), t), FEET()
ACT['vanish'] = dict(T=0.25, loop=False, f=vanish)


# 闪现出现：从缩着的样子猛地伸展开（伸过头一点再回来）
def appear(t):
    k = [(0.00, VAN, 'smooth'),
         (0.16, P(root=(0, -0.004, 0.006), Hips=(-2, 0, 0), Spine=(-4, 0, 0), Chest=(-6, 0, 0), neck=(-8, 0, 0), head=(-14, 0, 0), jaw=(10, 0, 0),
                  R_Arm=(-14, 24, 0), R_ForeArm=(-6, 0, 0), R_Fingers=(16, 0, 0), L_Arm=(-14, -24, 0), L_ForeArm=(-6, 0, 0), L_Fingers=(16, 0, 0)), 'out'),
         (0.30, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['appear'] = dict(T=0.3, loop=False, f=appear)


# 嗜血：两手抱头 → 仰头尖叫 → 身子弓起（手垂下、手指张开）→ 慢慢回站姿
def rage(t):
    HOLD = P(R_Arm=(-120, -40, 0), R_ForeArm=(-120, 0, 0), R_Hand=(0, 0, 0), R_Fingers=(10, 0, 0),
             L_Arm=(-120, 40, 0), L_ForeArm=(-120, 0, 0), L_Hand=(0, 0, 0), L_Fingers=(10, 0, 0))
    k = [(0.00, {}, 'smooth'),
         (0.35, dict(P(root=(0, 0.004, -0.04), Hips=(10, 0, 0), Spine=(12, 0, 0), Chest=(14, 0, 0), neck=(0, 0, 0), head=(8, 0, 0), jaw=(0, 0, 0)), **HOLD), 'out'),
         (0.80, dict(HOLD, **P(root=(0, 0.016, 0.0), Hips=(-4, 0, 0), Spine=(-10, 0, 0), Chest=(-16, 0, 0), neck=(-14, 0, 0), head=(-20, 0, 0), jaw=(36, 0, 0),
                              R_Arm=(-96, -30, 0), R_ForeArm=(-135, 0, 0), L_Arm=(-96, 30, 0), L_ForeArm=(-135, 0, 0))), 'smooth'),
         (1.05, P(jaw=(34, 0, 0)), 'smooth'),
         (1.40, P(root=(0, -0.006, -0.06), Hips=(14, 0, 0), Spine=(18, 0, 0), Chest=(22, 0, 0), neck=(-14, 0, 0), head=(-12, 0, 0), jaw=(16, 0, 0),
                  R_Arm=(-10, 26, 0), R_ForeArm=(-30, 0, 0), R_Fingers=(20, 0, 0), L_Arm=(-10, -26, 0), L_ForeArm=(-30, 0, 0), L_Fingers=(20, 0, 0)), 'smooth'),
         (1.80, P(root=(0, 0, -0.03), Hips=(6, 0, 0), Spine=(6, 0, 0), Chest=(8, 0, 0), neck=(-6, 0, 0), head=(-4, 0, 0), jaw=(8, 0, 0),
                  R_Arm=(-4, 10, 0), R_ForeArm=(-20, 0, 0), R_Fingers=(4, 0, 0), L_Arm=(-4, -10, 0), L_ForeArm=(-20, 0, 0), L_Fingers=(4, 0, 0)), 'smooth')]
    p = keyed(rel(k), t)
    if 0.6 < t < 1.5:
        a = math.sin(math.pi * (t - 0.6) / 0.9)
        p['head'] = add(p['head'], shake(t, 3.5 * a)); p['Chest'] = add(p['Chest'], shake(t, 2 * a, 51, 39))
    return p, FEET()
ACT['rage'] = dict(T=1.8, loop=False, f=rage, hit=0.8)


def hit(t):
    k = [(0.00, {}, 'smooth'),
         (0.08, P(root=(0, 0.012, -0.01), Hips=(-3, 0, 4), Spine=(-5, 0, 4), Chest=(-8, 0, 6), neck=(6, 0, 0), head=(8, -4, 6), jaw=(10, 0, 0),
                  R_Arm=(6, 10, 0), L_Arm=(6, -10, 0)), 'out'),
         (0.40, {}, 'smooth')]
    return keyed(rel(k), t), FEET()
ACT['hit'] = dict(T=0.4, loop=False, f=hit)


# 被打断：往后一缩、头一甩，晃一下站稳
def stagger(t):
    k = [(0.00, {}, 'smooth'),
         (0.14, P(root=(0.008, 0.02, -0.03), Hips=(-6, -4, 8), Spine=(-8, -4, 6), Chest=(-12, -4, 10), neck=(10, 0, -6), head=(12, -8, -10), jaw=(16, 0, 0),
                  R_Arm=(-30, 30, 0), R_ForeArm=(-40, 0, 0), L_Arm=(14, -20, 0)), 'in'),
         (0.40, P(root=(-0.006, -0.01, -0.03), Hips=(10, 4, -6), Spine=(8, 4, -6), Chest=(10, 4, -8), neck=(-8, 0, 8), head=(-4, 6, 10)), 'smooth'),
         (0.70, {}, 'smooth')]
    p = keyed(rel(k), t); f = FEET()
    if 0.04 < t < 0.4:
        u = math.sin(math.pi * (t - 0.04) / 0.36); x0, y0, z0, _ = STANCE['R']; f['R'] = (x0, y0 + 0.05 * u, z0 + 0.03 * u, -8 * u)
    return p, f
ACT['stagger'] = dict(T=0.7, loop=False, f=stagger)


# 倒下：仰头一抽 → 膝盖一软跪下 → 往前扑倒趴地
def die(t):
    k = [(0.00, {}, 'smooth'),
         (0.28, P(root=(0.0, 0.02, -0.01), Hips=(-6, 4, 6), Spine=(-8, 4, 6), Chest=(-12, 4, 8), neck=(-10, 0, 0), head=(-16, 0, 8), jaw=(30, 0, 0),
                  R_Arm=(16, 20, -10), L_Arm=(16, -20, 10)), 'out'),
         (0.80, P(root=(0.0, -0.02, -0.22), Hips=(20, 4, 4), Spine=(16, 0, 0), Chest=(14, 0, 0), neck=(-6, 0, 0), head=(2, 0, 0), jaw=(20, 0, 0),
                  R_Arm=(-10, 6, -12), R_ForeArm=(-10, 0, 0), L_Arm=(10, -6, 10)), 'in'),
         (1.00, P(root=(0.0, -0.02, -0.23), Hips=(22, 4, 4)), 'out'),
         (1.55, P(root=(0.0, -0.30, -0.40), Hips=(84, 6, 6), Spine=(6, 0, 0), Chest=(4, 0, 0), neck=(-10, 0, 10), head=(-10, 0, 20), jaw=(24, 0, 0),
                  R_Arm=(-130, 14, -30), R_ForeArm=(-10, 0, 0), R_Fingers=(20, 0, 0), L_Arm=(-120, -14, 30), L_ForeArm=(-20, 0, 0), L_Fingers=(10, 0, 0)), 'in'),
         (1.70, P(root=(0.0, -0.305, -0.405), Hips=(86, 6, 6), head=(-14, 0, 22)), 'out'),
         (2.00, P(root=(0.0, -0.305, -0.405), Hips=(86, 6, 6), head=(-12, 0, 22), R_Fingers=(-20, 0, 0), L_Fingers=(-24, 0, 0)), 'smooth')]
    p = keyed(rel(k), t)
    u = min(1, max(0, (t - 0.3) / 0.5)); u2 = min(1, max(0, (t - 1.0) / 0.55))
    return p, {'L': (0.09, 0.02 + 0.05 * u2, 0.065 - 0.01 * u, 35 * u + 20 * u2), 'R': (-0.09, 0.02 + 0.06 * u2, 0.065 - 0.01 * u, 35 * u + 20 * u2)}
ACT['die'] = dict(T=2.0, loop=False, f=die, hit=1.55, shake=1.55)

ORDER = ['idle', 'walk', 'throw', 'push', 'spread', 'scream', 'horn', 'vanish', 'appear', 'rage', 'hit', 'stagger', 'die']
