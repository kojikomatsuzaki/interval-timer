"""標準音を数式から生成。第三者音源・サンプルは使用しない。"""
from pathlib import Path
import math, wave, struct
ROOT = Path(__file__).resolve().parents[1] / 'audio'
ROOT.mkdir(exist_ok=True)
RATE = 22050
SOUNDS = {
    'soft-chime': (0.7, [(660, 1), (990, .3), (1320, .12)]),
    'bright-bell': (0.5, [(1047, 1), (1660, .35), (2360, .15)]),
    'low-gong': (1.2, [(150, 1), (236, .65), (317, .45), (431, .2)]),
    'short-horn': (0.55, [(220, 1), (277.18, .65), (329.63, .5)]),
}
for name, (duration, voices) in SOUNDS.items():
    data = bytearray()
    for i in range(round(RATE * duration)):
        t = i / RATE
        envelope = min(t / .008, 1) * math.exp(-6 * t / duration) * min((duration - t) / .02, 1)
        value = sum(weight * math.sin(2 * math.pi * frequency * t) for frequency, weight in voices)
        data.extend(struct.pack('<h', round(32767 * .28 * envelope * value / sum(w for _, w in voices))))
    with wave.open(str(ROOT / (name + '.wav')), 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(RATE); output.writeframes(data)
