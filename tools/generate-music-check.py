"""Generate two original, quiet 12-second PCM tones for the background probe."""
import math
from pathlib import Path
import struct
import wave


OUTPUT = Path(__file__).resolve().parents[1] / "source/media/music-check"
OUTPUT.mkdir(parents=True, exist_ok=True)
RATE = 8000
DURATION = 12
for name, notes in [("tone-a.wav", (261.63, 329.63, 392.00)),
                    ("tone-b.wav", (293.66, 349.23, 440.00))]:
    samples = bytearray()
    for frame in range(RATE * DURATION):
        seconds = frame / RATE
        beat = seconds % 1.5
        envelope = min(beat / 0.08, 1) * math.exp(-beat * 2.5)
        fade = min(seconds / 0.1, (DURATION - seconds) / 0.2, 1)
        note = notes[int(seconds / 1.5) % len(notes)]
        sound = math.sin(2 * math.pi * note * seconds)
        sound += 0.2 * math.sin(4 * math.pi * note * seconds)
        samples.extend(struct.pack("<h", int(32767 * 0.08 * envelope * fade * sound)))
    with wave.open(str(OUTPUT / name), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(samples)
    print(name, "12 seconds", len(samples), "PCM bytes")
