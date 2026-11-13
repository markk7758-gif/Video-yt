#!/bin/bash
# Mux the final jpeg sequence + mix.wav into videos/goose_king/goose_king.mp4 and run the frame-by-frame QA.
cd "$(dirname "$0")/.."
V=${VID:-goose_king}; F=${FRAMES:-out/final_frames}; OUT=videos/$V/$V.mp4; L=out/frames.txt; N=${TOTAL:-1872}; DUR=${DUR:-62.4}
ls $F | grep jpeg | sed -E 's/(.*-)0*([0-9]+)\.jpeg/\2 \0/' | sort -n | awk -v d="$F" '{print "file '"'"'" ENVIRON["PWD"] "/" d "/" $2 "'"'"'\nduration 0.0333333"}' > $L
n=$(grep -c "^file" $L); [ "$n" -eq "$N" ] || { echo "expected $N frames, have $n"; exit 1; }
ffmpeg -v error -y -f concat -safe 0 -i $L -i videos/$V/audio/mix.wav -map 0:v:0 -map 1:a:0 \
  -vf "fps=30,format=yuv420p" -c:v libx264 -preset slow -crf 17 -c:a aac -b:a 256k -t $DUR -movflags +faststart $OUT
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration -of compact $OUT
python3 scripts/short_qa.py $OUT out/qa_auto_$V ${SHOTS:-out/shots.json} 2>&1 | tail -25
