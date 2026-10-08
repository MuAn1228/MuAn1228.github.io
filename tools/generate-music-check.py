"""Generate quiet 12-second PCM tones and header-free MP3 probe segments."""
import math
from pathlib import Path
import re
import struct
import subprocess
import wave


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FFMPEG = PROJECT_ROOT / "node_modules/ffmpeg-static/ffmpeg.exe"
if not FFMPEG.is_file():
    raise SystemExit(
        f"MP3 generation needs the existing project FFmpeg executable: {FFMPEG}. "
        "No encoder was installed and no files were generated."
    )

OUTPUT = PROJECT_ROOT / "source/media/music-check"
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

    mp3_path = (OUTPUT / name).with_suffix(".mp3")
    encoded = subprocess.run(
        [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
         "-i", str(OUTPUT / name), "-map_metadata", "-1", "-vn",
         "-c:a", "libmp3lame", "-ac", "1", "-ar", "44100", "-b:a", "128k",
         "-write_xing", "0", "-id3v2_version", "0", "-write_id3v1", "0",
         str(mp3_path)],
        capture_output=True, text=True,
    )
    if encoded.returncode:
        raise SystemExit(f"Failed to encode {mp3_path.name}:\n{encoded.stderr}")

    checked = subprocess.run(
        [str(FFMPEG), "-hide_banner", "-nostdin", "-i", str(mp3_path),
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    duration = re.search(r"Duration: ([0-9:.]+)", checked.stderr)
    codec = re.search(r"Stream #0:0: Audio: ([^\r\n]+)", checked.stderr)
    if checked.returncode or not duration or not codec:
        raise SystemExit(f"Failed to verify {mp3_path.name}:\n{checked.stderr}")
    print(f"{mp3_path.name}: {codec.group(1)}; "
          f"duration {duration.group(1)}; {mp3_path.stat().st_size} bytes")
