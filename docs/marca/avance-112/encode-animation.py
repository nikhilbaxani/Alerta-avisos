"""Encode the SVG entrance into transparent WebP, GIF and APNG using Pillow.

python3 docs/marca/avance-112/encode-animation.py /tmp/avance-112-frames
"""
from pathlib import Path
import json
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parent
folder = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/avance-112-frames')
info = json.loads((folder/'frames.json').read_text())
frames = [Image.open(p).convert('RGBA') for p in sorted(folder.glob('frame-*.png'))]
assert len(frames) == info['frames']
duration = round(1000 / info['fps'])

frames[0].save(ROOT/'avance-112.webp', format='WEBP', save_all=True,
               append_images=frames[1:], duration=duration, loop=0, lossless=True,
               quality=75, method=4)
frames[0].save(ROOT/'avance-112.apng', format='PNG', save_all=True,
               append_images=frames[1:], duration=duration, loop=0,
               disposal=0, blend=0, optimize=True)

# A fixed palette prevents colour flicker. GIF alpha is binary.
sheet = Image.new('RGB', (550 * 5, 150 * 5))
for i, frame in enumerate(frames[::5][:24]):
    sheet.paste(frame.resize((550, 150)).convert('RGB'), ((i % 5)*550, (i // 5)*150))
colors = sheet.quantize(colors=255).getpalette()[:765]
palette = Image.new('P', (1, 1))
palette.putpalette(colors+[0, 0, 0])
gif_frames = []
for frame in frames:
    indexed = frame.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE)
    shifted = Image.new('P', indexed.size)
    shifted.putdata(bytes(min(255, v+1) for v in indexed.tobytes()))
    shifted.putpalette([0, 0, 0]+colors)
    shifted.paste(0, mask=frame.getchannel('A').point(lambda a: 255 if a < 128 else 0))
    gif_frames.append(shifted)
gif_frames[0].save(ROOT/'avance-112.gif', save_all=True, append_images=gif_frames[1:],
                   duration=duration, loop=0, transparency=0, disposal=2, optimize=False)

report = {**info, 'files': {}}
for extension in ['webp', 'apng', 'gif']:
    path = ROOT/f'avance-112.{extension}'
    with Image.open(path) as im:
        total = 0
        for i in range(im.n_frames):
            im.seek(i)
            rgba = im.convert('RGBA')
            assert rgba.getpixel((0, 0))[3] == 0
            assert rgba.getpixel((info['width']-1, info['height']-1))[3] == 0
            rgba.load()  # WebP exposes frame durations after decoding.
            total += im.info.get('duration', duration)
        assert im.convert('RGBA').getchannel('A').getextrema()[1] == 255
        assert total == info['duration_ms'], (extension, total)
        report['files'][extension] = {'bytes': path.stat().st_size, 'frames': im.n_frames,
                                      'duration_ms': total, 'transparent_corners': True}
        print(extension, report['files'][extension], flush=True)
(ROOT/'animation-export.json').write_text(json.dumps(report, indent=2)+'\n')
