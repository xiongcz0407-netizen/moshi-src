"""毒囊动作：关键帧 + 程序。坐标：Z 上，-Y 前（朝南），+X 是毒囊左手。
角度（度，骨架空间，相对 rest）：X 正 = 往前俯（向上的骨）/ 往后摆（向下的骨）；Y 正 = 往左（+X）歪；Z 正 = 往左转。"""
import math
FPS = 30
D = math.radians
CH = ['root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'Jaw', 'Belly',
      'L_Shoulder', 'L_Arm', 'L_ForeArm', 'L_Hand', 'L_Fingers', 'R_Shoulder', 'R_Arm', 'R_ForeArm', 'R_Hand', 'R_Fingers']
BASE = {}
def ease(u, k):
    u = max(0.0, min(1.0, u))
    if k == 'lin': return u
    if k == 'in': return u ** 2.4
    if k == 'in3': return u ** 3.2
    if k == 'out': return 1 - (1 - u) ** 2.4
    return u * u * (3 - 2 * u)
def add(a, b): return tuple(x + y for x, y in zip(a, b))
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
def breath(t, T=3.0, k=1.0):
    w = 2 * math.pi * t / T; br = math.sin(w)
    return {'root': (0, 0, 0.004 * k * br), 'Spine': (0.8 * k * br, 0, 0), 'Chest': (-1.5 * k * br, 0, 0.6 * math.sin(w * 0.5)), 'Belly': (-4 * k * br, 0, 0),
            'Neck': (1.0 * k * br, 0, 0), 'Head': (0.8 * k * math.sin(w - 0.7), 0, 0)}
def mix(a, b):
    o = dict(a)
    for k, v in b.items(): o[k] = add(o.get(k, (0, 0, 0)), v)
    return o
# 待机：一起一伏喘气，手指扒着崖边动一动（两只手错开）
def idle(t):
    T = 3.0; p = breath(t, T)
    p['Jaw'] = (-3 - 2 * math.sin(2 * math.pi * t / T * 2), 0, 0)
    for s, ph in (('L', 0), ('R', 1.7)):
        f = math.sin(2 * math.pi * t / T * 2 + ph)
        p[s + '_Fingers'] = (6 * max(0, f) ** 2, 0, 0); p[s + '_Hand'] = (-1.5 * f, 0, 0)
    return p
ACT['idle'] = dict(T=3.0, loop=True, f=idle)
# 酸液喷吐：往后仰 → 往前伸脖子张大嘴喷 → 收
def spit(t):
    k = [(0, {}, 'smooth'),
         (0.55, P(Chest=(-6, 0, 0), Neck=(-14, 0, 0), Head=(-10, 0, 0), Jaw=(-6, 0, 0), Belly=(-6, 0, 0)), 'out'),
         (0.80, P(Chest=(4, 0, 0), Neck=(12, 0, 0), Head=(-10, 0, 0), Jaw=(-28, 0, 0), Belly=(4, 0, 0)), 'in3'),
         (1.10, P(Chest=(3, 0, 0), Neck=(10, 0, 0), Head=(-8, 0, 0), Jaw=(-24, 0, 0)), 'out'),
         (1.50, {}, 'smooth')]
    return keyed(rel(k), t)
ACT['spit'] = dict(T=1.5, loop=False, f=spit, hit=0.8)
# 毒弹：鼓腮、头往后仰（开始一次）；每吐一发：头往前点一下张嘴
def bolt_wind(t):
    k = [(0, {}, 'smooth'), (0.5, P(Chest=(-8, 0, 0), Neck=(-12, 0, 0), Head=(-12, 0, 0), Belly=(-10, 0, 0), Jaw=(-4, 0, 0)), 'out'), (0.6, P(Neck=(-13, 0, 0)), 'smooth')]
    return keyed(rel(k), t)
ACT['bolt_wind'] = dict(T=0.6, loop=False, f=bolt_wind)
def bolt_spit(t):
    k = [(0, P(Chest=(-8, 0, 0), Neck=(-13, 0, 0), Head=(-12, 0, 0), Belly=(-10, 0, 0), Jaw=(-4, 0, 0)), 'smooth'),
         (0.12, P(Chest=(-2, 0, 0), Neck=(6, 0, 0), Head=(-4, 0, 0), Belly=(4, 0, 0), Jaw=(-26, 0, 0)), 'in'),
         (0.45, P(Chest=(-7, 0, 0), Neck=(-11, 0, 0), Head=(-10, 0, 0), Belly=(-8, 0, 0), Jaw=(-5, 0, 0)), 'out')]
    return keyed(rel(k), t)
ACT['bolt_spit'] = dict(T=0.45, loop=False, f=bolt_spit, hit=0.12)
# 毒囊爆裂：全身鼓起来发抖、头缩进肩膀 → 脓包弹出去时头猛地一抬
def burst(t):
    k = [(0, {}, 'smooth'),
         (0.9, P(root=(0, 0, 0.012), Spine=(-3, 0, 0), Chest=(-4, 0, 0), Neck=(6, 0, 0), Head=(0, 0, 0), Belly=(-14, 0, 0), Jaw=(-2, 0, 0),
                 L_Shoulder=(0, 0, 3), R_Shoulder=(0, 0, -3)), 'out'),
         (1.15, P(root=(0, -0.01, 0.016), Spine=(-3, 0, 0), Chest=(-5, 0, 0), Neck=(8, 0, 0), Head=(-16, 0, 0), Belly=(-18, 0, 0), Jaw=(-22, 0, 0),
                  L_Shoulder=(0, 0, -3), R_Shoulder=(0, 0, 3)), 'in3'),
         (1.5, P(Chest=(-4, 0, 0), Neck=(4, 0, 0), Head=(-10, 0, 0), Jaw=(-14, 0, 0)), 'out'),
         (2.1, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 0.3 < t < 1.12:
        a = min(1, (t - 0.3) / 0.6)
        for c, m in (('Chest', 1.4), ('Head', 2.2), ('Belly', 3)): p[c] = add(p[c], (m * a * math.sin(t * 67), m * a * math.sin(t * 53), 0))
    return p
ACT['burst'] = dict(T=2.1, loop=False, f=burst, hit=1.15)
# 拍地：一只手抬高 → 重重拍下 → 停一下 → 收回扒着崖边。L = 毒囊左手（+X）
def slam(side):
    sg = 1 if side == 'L' else -1
    def f(t):
        A = side + '_'; o = 'R_' if side == 'L' else 'L_'
        k = [(0, {}, 'smooth'),
             (0.35, P(**{A + 'Shoulder': (0, -3 * sg, 2 * sg), A + 'Arm': (-30, -14 * sg, 0), A + 'ForeArm': (-18, 0, 0), A + 'Hand': (-8, 0, 0),
                         'Chest': (-4, -4 * sg, 6 * sg), o + 'Arm': (4, 0, 0)}), 'out'),
             (1.25, P(**{A + 'Shoulder': (0, -5 * sg, 3 * sg), A + 'Arm': (-55, -20 * sg, 0), A + 'ForeArm': (-36, 0, 0), A + 'Hand': (-10, 0, 0), A + 'Fingers': (10, 0, 0),
                         'Chest': (-5, -4 * sg, 8 * sg), 'Spine': (-3, -3 * sg, 4 * sg), 'Neck': (-4, 0, 6 * sg), o + 'Arm': (6, 0, 0)}), 'smooth'),
             (1.32, P(**{A + 'Arm': (-56, -20 * sg, 0)}), 'smooth'),
             (1.5, P(**{A + 'Shoulder': (0, 3 * sg, -1 * sg), A + 'Arm': (10, 8 * sg, 0), A + 'ForeArm': (8, 0, 0), A + 'Hand': (8, 0, 0), A + 'Fingers': (-6, 0, 0),
                        'Chest': (6, 4 * sg, -4 * sg), 'Spine': (4, 2 * sg, 0), 'Neck': (4, 0, 0), 'Head': (-2, 0, 0), 'root': (0, 0, -0.012)}), 'in3'),
             (1.85, P(**{A + 'Arm': (9, 7 * sg, 0), 'Chest': (5, 4 * sg, -4 * sg), 'root': (0, 0, -0.011)}), 'out'),
             (2.6, {}, 'smooth')]
        return keyed(rel(k), t)
    return f
ACT['slam_l'] = dict(T=2.6, loop=False, f=slam('L'), hit=1.5)
ACT['slam_r'] = dict(T=2.6, loop=False, f=slam('R'), hit=1.5)
# 毒雾上涌（大招）：两手离开崖边张开、仰头长吼、头左右甩
def surge(t):
    k = [(0, {}, 'smooth'),
         (0.6, P(root=(0, 0, 0.01), Chest=(-3, 0, 0), L_Arm=(-12, -18, 6), R_Arm=(-12, 18, -6), L_ForeArm=(-16, 0, 0), R_ForeArm=(-16, 0, 0), Neck=(4, 0, 0)), 'out'),
         (1.2, P(root=(0, -0.01, 0.015), Spine=(-2, 0, 0), Chest=(-4, 0, 0), Neck=(10, 0, 0), Head=(-20, 0, 0), Jaw=(-30, 0, 0), Belly=(-8, 0, 0),
                 L_Shoulder=(0, -4, 5), R_Shoulder=(0, 4, -5), L_Arm=(-22, -34, 12), R_Arm=(-22, 34, -12), L_ForeArm=(-22, 0, 0), R_ForeArm=(-22, 0, 0),
                 L_Fingers=(-20, 0, 0), R_Fingers=(-20, 0, 0)), 'in'),
         (2.1, P(Chest=(-4, 0, 0), Neck=(10, 0, 0), Head=(-18, 0, 0), Jaw=(-32, 0, 0)), 'smooth'),
         (2.8, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 1.2 < t < 2.2:
        a = math.sin(math.pi * (t - 1.2) / 1.0)
        p['Head'] = add(p['Head'], (2 * a * math.sin(t * 40), 0, 16 * a * math.sin((t - 1.2) * 2 * math.pi * 1.4)))
    return p
ACT['surge'] = dict(T=2.8, loop=False, f=surge, hit=2.0)
# 受击：脓包抖一下、身体往后缩
def hit(t):
    k = [(0, {}, 'smooth'), (0.08, P(Spine=(-4, 0, 0), Chest=(-6, 0, 0), Neck=(-6, 0, 0), Head=(-6, 0, 0), Belly=(-6, 0, 0)), 'out'), (0.4, {}, 'smooth')]
    return keyed(rel(k), t)
ACT['hit'] = dict(T=0.4, loop=False, f=hit)
# 狂暴：仰头吼一声
def enrage(t):
    k = [(0, {}, 'smooth'),
         (0.5, P(Chest=(4, 0, 0), Neck=(6, 0, 0), Head=(0, 0, 0), Belly=(6, 0, 0)), 'out'),
         (0.85, P(root=(0, -0.008, 0), Spine=(-2, 0, 0), Chest=(-4, 0, 0), Neck=(10, 0, 0), Head=(-20, 0, 0), Jaw=(-32, 0, 0), L_Arm=(-6, -10, 0), R_Arm=(-6, 10, 0)), 'in'),
         (1.5, P(Chest=(-4, 0, 0), Jaw=(-30, 0, 0)), 'smooth'),
         (2.0, {}, 'smooth')]
    p = keyed(rel(k), t)
    if 0.85 < t < 1.6:
        a = math.sin(math.pi * (t - 0.85) / 0.75)
        p['Head'] = add(p['Head'], (3 * a * math.sin(t * 71), 0, 3 * a * math.sin(t * 49)))
        p['Chest'] = add(p['Chest'], (1.5 * a * math.sin(t * 61), 1.5 * a * math.sin(t * 43), 0))
    return p
ACT['enrage'] = dict(T=2.0, loop=False, f=enrage)
# 倒下：嚎叫（头往后仰）→ 手抓不住崖边往后滑（往下沉在代码里做）→ 头最后沉下去
def die(t):
    k = [(0, {}, 'smooth'),
         (0.6, P(Spine=(-4, 0, 0), Chest=(-10, 0, 0), Neck=(-16, 0, 0), Head=(-14, 0, 0), Jaw=(-34, 0, 0), L_Arm=(-10, -14, 0), R_Arm=(-10, 14, 0)), 'out'),
         (1.4, P(Chest=(-11, 0, 0), Neck=(-18, 0, 0), Jaw=(-30, 0, 0), L_Fingers=(20, 0, 0), R_Fingers=(20, 0, 0)), 'smooth'),
         (2.2, P(root=(0, 0.06, 0), Spine=(-10, 0, 0), Chest=(-20, 0, 0), Neck=(-30, 0, 0), Head=(-24, 0, 0), Jaw=(-20, 0, 0),
                 L_Arm=(30, -6, 0), R_Arm=(30, 6, 0), L_ForeArm=(30, 0, 0), R_ForeArm=(30, 0, 0), L_Hand=(30, 0, 0), R_Hand=(30, 0, 0), L_Fingers=(40, 0, 0), R_Fingers=(40, 0, 0)), 'in'),
         (3.0, P(root=(0, 0.08, 0), Neck=(-34, 0, 0), Head=(-28, 0, 0)), 'out')]
    p = keyed(rel(k), t)
    if 0.6 < t < 1.4:
        a = math.sin(math.pi * (t - 0.6) / 0.8)
        p['Head'] = add(p['Head'], (2 * a * math.sin(t * 63), 0, 3 * a * math.sin(t * 47)))
    return p
ACT['die'] = dict(T=3.0, loop=False, f=die, hit=2.2)
ORDER = ['idle', 'spit', 'bolt_wind', 'bolt_spit', 'burst', 'slam_l', 'slam_r', 'surge', 'hit', 'enrage', 'die']
