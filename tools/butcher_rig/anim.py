"""屠夫动作：关键帧 + 程序（腿 IK 防滑脚、刀/肚子/头弹簧跟随）。
坐标：Z 上，-Y 前，-X 是屠夫右手（拿刀）。角度用骨架轴：
  X 正：向上的骨头往前倾；向下的骨头往后摆。
  Y 正：向上的骨头往左（+X）歪。
  Z 正：往左转。
"""
import bpy, sys, math, json
from mathutils import Vector, Matrix, Quaternion, Euler
sys.path.insert(0, '/home/claude/fb/rig'); from joints import J, PAR
FPS = 30
D = math.radians

def ease(u, k):
    u = max(0.0, min(1.0, u))
    if k == 'lin': return u
    if k == 'in': return u ** 2.4            # 越来越快（出手）
    if k == 'in3': return u ** 3.2
    if k == 'out': return 1 - (1 - u) ** 2.4  # 越来越慢（收招、到位）
    if k == 'hold': return 0.0
    return u * u * (3 - 2 * u)               # smooth

CH = ['root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'R_Shoulder', 'R_Arm', 'R_ForeArm', 'R_Hand', 'Cleaver',
      'L_Shoulder', 'L_Arm', 'L_ForeArm', 'L_Hand', 'Belly']

# ---------- 基础站姿（重、微屈膝、身体略前倾，刀垂在右前方） ----------
BASE = {
    'root': (0, 0.0, -0.022), 'Hips': (4, 0, 0), 'Spine': (3, 0, 0), 'Chest': (2, 0, 0), 'Neck': (-4, 0, 0), 'Head': (-3, 0, 0),
    'R_Arm': (8, 0, -6), 'R_ForeArm': (-14, 0, 0), 'R_Hand': (0, 0, 0), 'Cleaver': (0, 0, 0),
    'L_Arm': (14, 0, 6), 'L_ForeArm': (10, 0, 0), 'L_Hand': (0, 0, 0),
}
STANCE = {'L': (0.19, 0.06, 0.05, 0), 'R': (-0.15, 0.03, 0.05, 0)}  # 脚踝 x,y,z,脚尖俯仰

def add(a, b):
    return tuple(x + y for x, y in zip(a, b))

def keyed(keys, t):
    """keys: [(time, pose{ch:(..)}, ease)]，缺的通道沿用上一个关键帧。"""
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
                out[k] = tuple(x + (y - x) * u for x, y in zip(a, b)) if isinstance(a, tuple) else (b if u > .5 else a)
            return out
    return dict(full[-1][1])

# ---------- 各动作 ----------
def P(**kw):
    """相对基础站姿的偏移。"""
    return {k: v for k, v in kw.items()}

def st(**kw):  # 两脚位置
    return kw

ACT = {}

# 待机：慢呼吸 + 左右换重心，刀轻晃（弹簧来）
def idle(t, T=2.6):
    w = 2 * math.pi * t / T
    sh = math.sin(w) * 0.008      # 重心左右
    br = math.sin(2 * w)          # 呼吸两次
    p = {'root': (sh, 0, -0.022 - 0.004 * (0.5 + 0.5 * math.sin(2 * w - 1.2))),
         'Hips': (4, -2.0 * math.sin(w), 1.5 * math.sin(w)),
         'Spine': (3 + 0.8 * br, 1.2 * math.sin(w), 0), 'Chest': (2 + 1.6 * br, 1.0 * math.sin(w), -1.5 * math.sin(w)),
         'Neck': (-4 - 1.2 * br, 0, 0), 'Head': (-3 - 0.8 * br, 0, 2.5 * math.sin(w * 0.5)),
         'R_Arm': (8 + 1.5 * br, 0, -6), 'L_Arm': (14 + 1.5 * math.sin(2 * w + .5), 0, 6), 'L_ForeArm': (10 + 2 * br, 0, 0)}
    return p, {'L': STANCE['L'], 'R': STANCE['R']}
ACT['idle'] = dict(T=2.6, loop=True, f=idle)

def gait(t, T, step, lift, drop, lean, armsw, bob, flight=0.0, stanceFrac=0.6):
    """步态：每只脚在支撑相里按速度往后挪（脚不滑），摆动相抬起往前。速度 = 2*step / (T*stanceFrac)。"""
    out = {}
    ph = (t / T) % 1.0
    for side, off in (('L', 0.0), ('R', 0.5)):
        q = (ph + off) % 1.0
        x0, y0, z0, _ = STANCE[side]
        if q < stanceFrac:   # 支撑：从前(-step) 到后(+step)，匀速
            u = q / stanceFrac
            y = y0 - step + 2 * step * u; z = z0; pitch = -12 * (1 - u) ** 6 + 28 * max(0, u - 0.75) / 0.25 * 0.6
        else:               # 摆动：从后到前，抬脚
            u = (q - stanceFrac) / (1 - stanceFrac)
            s = u * u * (3 - 2 * u)
            y = y0 + step - 2 * step * s; z = z0 + lift * math.sin(math.pi * u) ** 1.2
            pitch = 16 * (1 - u) ** 2 - 14 * u ** 3
        out[side] = (x0, y, z, pitch)
    # 重心：每次落地（左 q=0 / 右 q=0.5）往下沉一下再起
    def contact(phase):
        d = (ph - phase) % 1.0
        return math.exp(-((d - 0.08) / 0.07) ** 2) if d < 0.5 else 0
    sink = contact(0.0) + contact(0.5)
    rise = 0.5 + 0.5 * math.cos(4 * math.pi * (ph - 0.25))
    z = -0.022 - drop - bob * sink + 0.4 * bob * (rise - 0.5) + flight * max(0, math.sin(2 * math.pi * (2 * ph - 0.62)))
    side = math.sin(2 * math.pi * ph)            # 左脚支撑时重心偏左
    sw = math.sin(2 * math.pi * ph)
    p = {'root': (0.012 * side, 0, z),
         'Hips': (4 + lean * 0.5, -3.5 * side, 7 * sw), 'Spine': (3 + lean * 0.3, 1.5 * side, -3 * sw),
         'Chest': (2 + lean * 0.2 + 2 * sink, 1.0 * side, -5 * sw), 'Neck': (-4 - lean * 0.6, 0, 2 * sw), 'Head': (-3 - lean * 0.3, 0, 2 * sw),
         'R_Arm': (8 - armsw * 0.5 * sw, 0, -6), 'R_ForeArm': (-18, 0, 0),
         'L_Arm': (14 + armsw * sw, 0, 6), 'L_ForeArm': (12 + armsw * 0.3 * (1 + sw), 0, 0)}
    return p, out

WALK = dict(T=1.0, step=0.11, lift=0.05, drop=0.012, lean=5, armsw=18, bob=0.016, stanceFrac=0.62)
def walk(t): return gait(t, **WALK)
ACT['walk'] = dict(T=WALK['T'], loop=True, f=walk, speed=2 * WALK['step'] / (WALK['T'] * WALK['stanceFrac']))

RUN = dict(T=0.55, step=0.15, lift=0.08, drop=0.035, lean=22, armsw=28, bob=0.02, flight=0.014, stanceFrac=0.38)
def run(t):
    p, f = gait(t, **RUN)
    sw = math.sin(2 * math.pi * t / RUN['T'])
    p['R_Arm'] = (-10 - 10 * sw, 0, -14); p['R_ForeArm'] = (-40, 0, 0)   # 刀斜在身前，跑起来上下甩
    p['L_Arm'] = (20 + 30 * sw, 0, 10); p['L_ForeArm'] = (-30, 0, 0)
    p['Neck'] = (-18, 0, 0); p['Head'] = (-8, 0, 0)
    return p, f
ACT['run'] = dict(T=RUN['T'], loop=True, f=run, speed=2 * RUN['step'] / (RUN['T'] * RUN['stanceFrac']))

# 普攻挥刀：0～0.6 秒预警（举刀往右后蓄力）→ 0.6 落刀 → 收招到 1.3 秒
def swing(t):
    k = [
        (0.00, {}, 'smooth'),
        (0.48, P(root=(0.006, 0.010, -0.034), Hips=(-2, 3, -16), Spine=(-6, 2, -14), Chest=(-8, 2, -16), Neck=(-6, 0, 10), Head=(-4, 0, 8),
                 R_Arm=(-150, 0, -38), R_ForeArm=(-60, 0, 0), R_Hand=(-20, 0, 0),
                 L_Arm=(-30, 0, 20), L_ForeArm=(-20, 0, 0)), 'out'),
        (0.56, P(root=(0.004, 0.012, -0.036), Chest=(-10, 2, -18), R_Arm=(-158, 0, -40)), 'smooth'),   # 顶点停一下
        (0.64, P(root=(-0.004, -0.014, -0.046), Hips=(5, -2, 14), Spine=(6, -2, 12), Chest=(9, -2, 16), Neck=(-8, 0, -6), Head=(-4, 0, -6),
                 R_Arm=(-30, 0, 18), R_ForeArm=(-26, 0, 0), R_Hand=(10, 0, 0),
                 L_Arm=(30, 0, -8), L_ForeArm=(10, 0, 0)), 'in3'),
        (0.86, P(root=(-0.004, -0.016, -0.050), Chest=(11, -2, 20), R_Arm=(-22, 0, 24)), 'out'),
        (1.30, {}, 'smooth'),
    ]
    return keyed(rel(k), t), {'L': STANCE['L'], 'R': (-0.15, 0.03 + 0.0, 0.05, 0)}
ACT['swing'] = dict(T=1.30, loop=False, f=swing, hit=0.62, warn=0.6, still=((0.66, 0.8),))

def rel(keys):
    """把相对偏移加到基础姿势上；空字典 = 回到基础。"""
    out = []; prev = {}
    for tm, p, e in keys:
        q = {}
        for c in CH:
            b = BASE.get(c, (0, 0, 0))
            q[c] = add(b, p[c]) if c in p else (prev.get(c, b) if p else b)
        out.append((tm, q, e)); prev = q
    return out

# 冲锋起步：1.5 秒预警（压低、刨地、刀往后拖）→ 结尾接跑
def charge_start(t):
    T = 1.5
    k = [
        (0.00, {}, 'smooth'),
        (0.35, P(root=(0, 0.02, -0.040), Hips=(10, 0, 0), Spine=(10, 0, 0), Chest=(12, 0, 0), Neck=(-20, 0, 0), Head=(-10, 0, 0),
                 R_Arm=(28, 0, -18), R_ForeArm=(-30, 0, 0), L_Arm=(-20, 0, 18), L_ForeArm=(-30, 0, 0)), 'out'),
        (0.75, P(root=(0, 0.025, -0.046), Chest=(16, 0, 4), Neck=(-24, 0, -6)), 'smooth'),
        (1.10, P(root=(0, 0.03, -0.050), Chest=(18, 0, -4), Neck=(-24, 0, 6)), 'smooth'),
        (1.42, P(root=(0, 0.035, -0.052), Hips=(14, 0, 0), Spine=(14, 0, 0), Chest=(22, 0, 0), Neck=(-28, 0, 0), Head=(-10, 0, 0),
                 R_Arm=(-2, 0, -14), R_ForeArm=(-40, 0, 0), L_Arm=(10, 0, 10), L_ForeArm=(-30, 0, 0)), 'smooth'),
        (T, P(root=(0, 0.035, -0.052)), 'smooth'),
    ]
    p = keyed(rel(k), t)
    # 右脚刨地两下
    f = {'L': (0.19, 0.0, 0.05, 0), 'R': STANCE['R']}
    for c0 in (0.45, 0.85):
        u = (t - c0) / 0.32
        if 0 < u < 1:
            x0, y0, z0, _ = STANCE['R']
            f['R'] = (x0, y0 + 0.06 * math.sin(math.pi * u) * (1 if u > 0.5 else -0.3), z0 + 0.03 * math.sin(math.pi * u), 20 * math.sin(math.pi * u))
    if t > 1.1: f['L'] = (0.19, -0.03 * min(1, (t - 1.1) / 0.3), 0.05, 0)
    return p, f
ACT['charge_start'] = dict(T=1.5, loop=False, f=charge_start, hit=1.5, warn=1.5)

# 砸地：0～1.5 双手举刀（先下蹲再起身踮脚）→ 1.5 刀砸到地 → 停顿 → 收
def slam(t):
    k = [
        (0.00, {}, 'smooth'),
        (0.30, P(root=(0, 0.01, -0.050), Hips=(12, 0, 0), Spine=(10, 0, 0), Chest=(12, 0, 0), Neck=(-14, 0, 0),
                 R_Arm=(30, 0, -10), R_ForeArm=(-30, 0, 0), L_Arm=(30, 0, 10), L_ForeArm=(-30, 0, 0)), 'out'),   # 往下蓄
        (0.95, P(root=(0, 0.018, 0.004), Hips=(-6, 0, 0), Spine=(-10, 0, 0), Chest=(-14, 0, 0), Neck=(8, 0, 0), Head=(6, 0, 0),
                 R_Arm=(-168, 0, 20), R_ForeArm=(-50, 0, 0), R_Hand=(-30, 0, 0),
                 L_Arm=(-170, 0, -22), L_ForeArm=(-60, 0, 0), L_Hand=(0, 0, 0)), 'smooth'),   # 高举、踮脚
        (1.32, P(root=(0, 0.022, 0.010), Hips=(-8, 0, 0), Spine=(-12, 0, 0), Chest=(-16, 0, 0), R_Arm=(-174, 0, 22), L_Arm=(-176, 0, -24)), 'smooth'),  # 顶点停住
        (1.50, P(root=(0, -0.022, -0.090), Hips=(24, 0, 0), Spine=(22, 0, 0), Chest=(26, 0, 0), Neck=(-20, 0, 0), Head=(-10, 0, 0),
                 R_Arm=(-57, 0, 14), R_ForeArm=(-22, 0, 0), R_Hand=(0, 0, 0),
                 L_Arm=(-48, 0, -12), L_ForeArm=(-30, 0, 0)), 'in3'),   # 砸下去
        (1.85, P(root=(0, -0.024, -0.094), Hips=(25, 0, 0), Chest=(28, 0, 0)), 'out'),   # 压住
        (2.70, {}, 'smooth'),
    ]
    p = keyed(rel(k), t)
    lz = 0.05 + (0.012 * math.sin(math.pi * min(1, max(0, (t - 0.6) / 0.85))) if t < 1.45 else 0)
    f = {'L': (0.19, 0.06, 0.05, 0), 'R': (-0.15, 0.03, 0.05, 0)}
    if 0.6 < t < 1.45:  # 踮脚：脚尖往下
        u = math.sin(math.pi * (t - 0.6) / 0.85)
        f = {'L': (0.19, 0.06, 0.05 + 0.012 * u, 14 * u), 'R': (-0.15, 0.03, 0.05 + 0.012 * u, 14 * u)}
    return p, f
ACT['slam'] = dict(T=2.7, loop=False, f=slam, hit=1.5, warn=1.5, shake=1.5, still=((1.48, 1.9),))

# 吼叫（叫小丧尸）：吸气后仰 → 往前吼，两手张开 → 收
def roar(t):
    k = [
        (0.00, {}, 'smooth'),
        (0.50, P(root=(0, 0.02, -0.010), Hips=(-6, 0, 0), Spine=(-10, 0, 0), Chest=(-14, 0, 0), Neck=(10, 0, 0), Head=(10, 0, 0),
                 R_Arm=(10, 0, -24), L_Arm=(14, 0, 24), R_ForeArm=(-30, 0, 0), L_ForeArm=(-30, 0, 0)), 'out'),
        (0.75, P(root=(0, -0.015, -0.050), Hips=(12, 0, 0), Spine=(14, 0, 0), Chest=(14, 0, 0), Neck=(-24, 0, 0), Head=(-20, 0, 0),
                 R_Arm=(-40, 0, -70), R_ForeArm=(-30, 0, 0), L_Arm=(-40, 0, 70), L_ForeArm=(-40, 0, 0)), 'in'),
        (1.30, P(root=(0, -0.016, -0.052), Chest=(16, 0, 0), Neck=(-26, 0, 0), Head=(-22, 0, 0), R_Arm=(-44, 0, -74), L_Arm=(-44, 0, 74)), 'smooth'),
        (1.90, {}, 'smooth'),
    ]
    p = keyed(rel(k), t)
    if 0.75 < t < 1.35:  # 吼的时候头抖
        p['Head'] = add(p['Head'], (2.5 * math.sin(t * 70), 0, 2 * math.sin(t * 53)))
    return p, {'L': STANCE['L'], 'R': STANCE['R']}
ACT['roar'] = dict(T=1.9, loop=False, f=roar, hit=0.8, warn=1.5)

# 受击：往后一顿，慢慢回
def hit(t):
    k = [
        (0.00, {}, 'smooth'),
        (0.08, P(root=(0, 0.012, -0.012), Hips=(-4, 0, 4), Spine=(-6, 0, 3), Chest=(-8, 0, 4), Neck=(8, 0, 0), Head=(8, 0, 4),
                 R_Arm=(6, 0, 0), L_Arm=(10, 0, 0)), 'out'),
        (0.45, {}, 'smooth'),
    ]
    return keyed(rel(k), t), {'L': STANCE['L'], 'R': STANCE['R']}
ACT['hit'] = dict(T=0.45, loop=False, f=hit)

# 狂暴：缩身蓄力 → 起身握拳张开、捶胸般大吼、身体抖
def enrage(t):
    k = [
        (0.00, {}, 'smooth'),
        (0.45, P(root=(0, 0.01, -0.060), Hips=(16, 0, 0), Spine=(16, 0, 0), Chest=(18, 0, 0), Neck=(-10, 0, 0), Head=(4, 0, 0),
                 R_Arm=(10, 0, 10), R_ForeArm=(-80, 0, 0), L_Arm=(10, 0, -10), L_ForeArm=(-90, 0, 0)), 'out'),
        (0.80, P(root=(0, 0.02, 0.006), Hips=(-8, 0, 0), Spine=(-14, 0, 0), Chest=(-18, 0, 0), Neck=(16, 0, 0), Head=(12, 0, 0),
                 R_Arm=(-60, 0, -80), R_ForeArm=(-70, 0, 0), L_Arm=(-60, 0, 80), L_ForeArm=(-80, 0, 0)), 'in'),
        (1.60, P(root=(0, 0.02, 0.004), Chest=(-20, 0, 0)), 'smooth'),
        (2.20, {}, 'smooth'),
    ]
    p = keyed(rel(k), t)
    if 0.8 < t < 1.65:
        a = math.sin(math.pi * (t - 0.8) / 0.85)
        p['Chest'] = add(p['Chest'], (1.5 * a * math.sin(t * 61), 1.5 * a * math.sin(t * 47), 0))
        p['Head'] = add(p['Head'], (3 * a * math.sin(t * 73), 0, 3 * a * math.sin(t * 51)))
    return p, {'L': STANCE['L'], 'R': STANCE['R']}
ACT['enrage'] = dict(T=2.2, loop=False, f=enrage)

# 倒下：踉跄 → 跪 → 往前扑倒（最后一帧停住）
def die(t):
    k = [
        (0.00, {}, 'smooth'),
        (0.35, P(root=(0.01, 0.03, -0.020), Hips=(-6, 6, 8), Spine=(-8, 4, 6), Chest=(-10, 4, 8), Neck=(12, 0, 0), Head=(14, 0, 10),
                 R_Arm=(20, 0, -10), L_Arm=(24, 0, 20)), 'out'),
        (0.95, P(root=(0.0, -0.01, -0.14), Hips=(18, 4, 4), Spine=(14, 0, 0), Chest=(14, 0, 0), Neck=(-8, 0, 0), Head=(4, 0, 0),
                 R_Arm=(10, 0, -12), R_ForeArm=(-10, 0, 0), L_Arm=(10, 0, 10)), 'in'),        # 跪下
        (1.25, P(root=(0.0, -0.01, -0.15), Hips=(20, 4, 4)), 'out'),
        (1.85, P(root=(0.0, -0.20, -0.255), Hips=(84, 6, 6), Spine=(6, 0, 0), Chest=(4, 0, 0), Neck=(-10, 0, 10), Head=(-10, 0, 20),
                 R_Arm=(-120, 0, -30), R_ForeArm=(-10, 0, 0), L_Arm=(-110, 0, 30), L_ForeArm=(-20, 0, 0)), 'in'),   # 扑倒
        (2.05, P(root=(0.0, -0.205, -0.262), Hips=(86, 6, 6), Head=(-14, 0, 22)), 'out'),
        (2.60, P(root=(0.0, -0.205, -0.262), Hips=(86, 6, 6), Head=(-12, 0, 22)), 'smooth'),
    ]
    p = keyed(rel(k), t)
    u = min(1, max(0, (t - 0.5) / 0.6)); u2 = min(1, max(0, (t - 1.3) / 0.6))
    f = {'L': (0.19, 0.06 + 0.04 * u2, 0.05 - 0.01 * u, 35 * u + 20 * u2), 'R': (-0.15, 0.03 + 0.05 * u2, 0.05 - 0.01 * u, 35 * u + 20 * u2)}
    return p, f
ACT['die'] = dict(T=2.6, loop=False, f=die, hit=1.85, shake=1.85)

ORDER = ['idle', 'walk', 'run', 'swing', 'charge_start', 'slam', 'roar', 'hit', 'enrage', 'die']
