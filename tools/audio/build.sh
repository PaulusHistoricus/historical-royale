#!/usr/bin/env bash
# Geluid: audio/source/*.mp3 -> public/assets/audio/*.mp3 (vereist ffmpeg).
# Effecten: stilte vooraan weg, ingekort met fade-out, gelijk volume (loudnorm), mono 96 kbps.
# Muziek: gelijk volume, stereo 96 kbps.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=audio/source; OUT=public/assets/audio; mkdir -p "$OUT"
sfx() {  # naam  maxduur  luidheid(LUFS)
  local name=$1 dur=$2 lufs=${3:--16} fade
  fade=$(awk "BEGIN{print ($dur>0.5)?0.15:0.05}")
  ffmpeg -v error -y -i "$SRC/$name.mp3" -af "silenceremove=start_periods=1:start_threshold=-45dB,atrim=0:$dur,afade=t=out:st=$(awk "BEGIN{print $dur-$fade}"):d=$fade,loudnorm=I=$lufs:TP=-1.5:LRA=11" \
    -ac 1 -ar 44100 -b:a 96k "$OUT/$name.mp3"
}
for n in sword-1 sword-2 sword-3; do sfx $n 0.7 -17; done
sfx axe 1.0 -17
for n in death-male-1 death-male-2 death-female-1 death-female-2 death-female-3; do sfx $n 1.4 -18; done
sfx death-collapse 1.0 -18
sfx musket 1.2 -16
sfx machine-gun 1.8 -17
sfx explosion 1.5 -16
sfx heal 1.6 -18
sfx magic-wind 1.8 -19
sfx small-explosion 0.6 -17
sfx kiss 0.8 -17
sfx tower-collapse 2.9 -15
sfx fire-magic 0.95 -17
sfx arrow 0.6 -18
# Unit expansion 2
for n in spear-1 spear-2; do sfx $n 0.6 -17; done
for n in potion-1 potion-2; do sfx $n 0.9 -18; done
sfx choir 2.3 -19
sfx horse-death 2.3 -17
sfx knife 0.8 -17
sfx teleport 1.2 -19
sfx laugh 1.1 -16
# lussen: vlammenwerper en paardengetrappel
ffmpeg -v error -y -ss 2 -t 3 -i "$SRC/flamethrower.mp3" -af "afade=t=in:d=0.15,afade=t=out:st=2.8:d=0.2,loudnorm=I=-20:TP=-2:LRA=11" -ac 1 -ar 44100 -b:a 80k "$OUT/flamethrower.mp3"
ffmpeg -v error -y -ss 0.5 -t 3 -i "$SRC/gallop.mp3" -af "afade=t=in:d=0.1,afade=t=out:st=2.85:d=0.15,loudnorm=I=-22:TP=-2:LRA=11" -ac 1 -ar 44100 -b:a 80k "$OUT/gallop.mp3"
# vuur: 3 s lus uit het midden, zacht in- en uitfaden
ffmpeg -v error -y -ss 20 -t 3 -i "$SRC/fire.mp3" -af "afade=t=in:d=0.3,afade=t=out:st=2.6:d=0.4,loudnorm=I=-22:TP=-2:LRA=11" -ac 1 -ar 44100 -b:a 80k "$OUT/fire.mp3"
for n in music-1 music-2 music-3; do
  ffmpeg -v error -y -i "$SRC/$n.mp3" -af "loudnorm=I=-20:TP=-1.5:LRA=11" -ac 2 -ar 44100 -b:a 96k "$OUT/$n.mp3"
done
ls -la "$OUT"
