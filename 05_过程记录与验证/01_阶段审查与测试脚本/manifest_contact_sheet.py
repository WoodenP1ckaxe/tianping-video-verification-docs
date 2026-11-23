import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


video = Path(sys.argv[1])
manifest = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
output = Path(sys.argv[3])
work = output.parent / (output.stem + "_frames")
work.mkdir(parents=True, exist_ok=True)

region = manifest["displayRegion"]
probe = subprocess.run(
    [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", str(video),
    ],
    check=True, capture_output=True, text=True,
)
stream = json.loads(probe.stdout)["streams"][0]
width = int(stream["width"])
height = int(stream["height"])
crop_width = max(2, int(region["width"] * width))
crop_height = max(2, int(region["height"] * height))
crop_x = max(0, int(region["x"] * width))
crop_y = max(0, int(region["y"] * height))

tiles = []
for readout in manifest["readouts"]:
    key = f"I{int(readout['point']) + 1}-{int(readout['idx'])}"
    target = work / f"{key}_{readout['off']}.png"
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-ss", str(readout["off"]), "-i", str(video),
            "-frames:v", "1",
            "-vf", f"crop={crop_width}:{crop_height}:{crop_x}:{crop_y}",
            "-y", str(target),
        ],
        check=True,
    )
    image = Image.open(target).convert("RGB")
    image.thumbnail((900, 180))
    tile = Image.new("RGB", (920, 230), "white")
    tile.paste(image, ((920 - image.width) // 2, 34))
    draw = ImageDraw.Draw(tile)
    draw.text(
        (8, 7),
        f"{key} @ {readout['off']}s | expected {readout['value']} g",
        fill="black",
    )
    tiles.append(tile)

sheet = Image.new("RGB", (920 * 3, 230 * 3), "#d9d9d9")
for index, tile in enumerate(tiles):
    sheet.paste(tile, ((index % 3) * 920, (index // 3) * 230))
sheet.save(output)
print(output)
