
cd /tmp/ch

python3.11 fit.py > l2.log 2>&1 || true
python3.11 rig.py > l3.log 2>&1 || true
python3.11 anim.py > l4.log 2>&1 || true
echo DONE > done.flag
