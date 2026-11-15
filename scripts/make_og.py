"""Generate assets/og-image.png (1200x630) for social sharing. Run: python3 scripts/make_og.py"""
from PIL import Image, ImageDraw, ImageFont
W, H = 1200, 630
img = Image.new("RGB", (W, H), "#0f3d3e")
d = ImageDraw.Draw(img)
def font(size, bold=False):
    for p in (["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"] if bold else ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]):
        try: return ImageFont.truetype(p, size)
        except OSError: pass
    return ImageFont.load_default()
# roster blocks
colors = ["#ff7a45", "#b9f5d6", "#7cc7ff", "#c3b1ff"]
for r in range(5):
    for c in range(5):
        if (r * 3 + c) % 4 == 3: continue
        x, y = 775 + c * 80, 120 + r * 76
        d.rounded_rectangle([x, y, x + 68, y + 56], 12, fill=colors[(r + c) % 4])
d.rounded_rectangle([60, 70, 128, 138], 16, fill="#ff7a45")
d.text((150, 78), "Shiftnest", font=font(48, True), fill="white")
d.text((60, 200), "Build next week's", font=font(56, True), fill="white")
d.text((60, 270), "roster in 10 minutes.", font=font(56, True), fill="#b9f5d6")
d.text((60, 370), "Staff scheduling for multi-location", font=font(30), fill="#d6e8e3")
d.text((60, 410), "retail & cafes", font=font(30), fill="#d6e8e3")
d.text((60, 540), "Fictional brand  |  Portfolio project by Yash Sarkar", font=font(24), fill="#9fbfb8")
img.save("assets/og-image.png", optimize=True)
print("wrote assets/og-image.png")
