set -e
cd /home/claude/fb2/rig
python3 -c "import bpy; exec(open('rigbuild.py').read())" 2>&1 | grep -E "smooth|saved|Error" 
python3 -c "import bpy; exec(open('bake.py').read())" 2>&1 | grep -E "^\{|Error" | head -3
python3 -c "import bpy; exec(open('export.py').read())" 2>&1 | grep -E "done|Error"
mkdir -p /tmp/c84/gp/in /tmp/c84/gp/out; cp /home/claude/fb2/out/toxic_raw.glb /tmp/c84/gp/in/toxic.glb
cp /home/claude/moshi/tools/glbpress.mjs /tmp/gt/ && cd /tmp/gt && node glbpress.mjs /tmp/c84/gp/in /tmp/c84/gp/out | tail -2
cp /tmp/c84/gp/out/toxic.glb /tmp/c84/av/toxic_new.glb; ls -la /tmp/c84/av/toxic_new.glb
