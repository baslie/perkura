import sys
from PIL import Image, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True

path = sys.argv[1]
FRAME_W = float(sys.argv[2]) if len(sys.argv) > 2 else 1920.0

im = Image.open(path).convert("L")
W, H = im.size
k = W / FRAME_W
px = im.load()
print("PNG %dx%d, макет %dx%d, масштаб %.3f" % (W, H, FRAME_W, round(H / k), k))


def cols(y0, y1, x0=0, x1=None, thr=170, gap=14):
    x1 = FRAME_W if x1 is None else x1
    ya, yb = max(0, int(y0 * k)), min(H, int(y1 * k))
    hit = [x for x in range(int(x0 * k), min(W, int(x1 * k))) if any(px[x, y] < thr for y in range(ya, yb))]
    out, start, prev = [], None, None
    for x in hit:
        if start is None:
            start = prev = x
        elif x - prev > gap * k:
            out.append((round(start / k), round(prev / k)))
            start = x
        prev = x
    if start is not None:
        out.append((round(start / k), round(prev / k)))
    return out


def rows(x0, x1, y0, y1, thr=170, gap=10):
    xa, xb = int(x0 * k), min(W, int(x1 * k))
    hit = [y for y in range(max(0, int(y0 * k)), min(H, int(y1 * k)))
           if any(px[x, y] < thr for x in range(xa, xb, 2))]
    out, start, prev = [], None, None
    for y in hit:
        if start is None:
            start = prev = y
        elif y - prev > gap * k:
            out.append((round(start / k), round(prev / k)))
            start = y
        prev = y
    if start is not None:
        out.append((round(start / k), round(prev / k)))
    return out


def scan(label, x0, x1, y0, y1, thr=170, gap=10):
    print("--- %s (x %d..%d, y %d..%d) ---" % (label, x0, x1, y0, y1))
    for a, b in rows(x0, x1, y0, y1, thr, gap):
        print("   y %4d..%4d h=%3d   x:" % (a, b, b - a + 1), cols(a, b + 1, x0, x1, thr))


if __name__ == "__main__":
    import json
    for spec in json.loads(sys.argv[3]):
        scan(*spec)
