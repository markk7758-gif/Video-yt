#!/bin/bash
# usage: scripts/render_chunks.sh <outdir> <scale> <props-json> [chunk]  - renders the composition as a jpeg sequence in
# chunks, skipping chunks whose frames already exist, so a stopped render resumes where it left off
cd "$(dirname "$0")/.."
OUT=$1; SCALE=$2; PROPS=$3; CH=${4:-200}; TOTAL=${TOTAL:-1872}; COMP=${COMP:-GooseKing}
mkdir -p "$OUT"
for ((a=0; a<TOTAL; a+=CH)); do
  b=$((a+CH-1)); [ $b -ge $TOTAL ] && b=$((TOTAL-1))
  last=$(printf "%s/element-%04d.jpeg" "$OUT" $b)
  [ -f "$last" ] && continue
  npx remotion render src/index.ts "$COMP" "$OUT" --sequence --image-format=jpeg --jpeg-quality=92 --frames=$a-$b --scale=$SCALE \
    --gl=swangle --concurrency=2 --timeout=900000 --props="$PROPS" --log=error >> "$OUT/render.log" 2>&1
  echo "chunk $a-$b exit $?" >> "$OUT/render.log"
done
echo "ALL DONE" >> "$OUT/render.log"
