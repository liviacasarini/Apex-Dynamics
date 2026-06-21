"""
Usa a logo original (apex-logo.png) como ícone do app mobile.
Coloca sobre fundo escuro #0a0a0f, centralizada com padding.
Gera icon.png (1024x1024) e adaptive-icon.png (1024x1024 com padding extra para Android).
"""
from PIL import Image

SIZE = 1024

SRC = r'C:\Users\Lívia\Documents\GitHub\Apex-Dynamics\public\apex-logo.png'
DST_ICON     = r'C:\Users\Lívia\Documents\GitHub\Apex-Dynamics\mobile\assets\icon.png'
DST_ADAPTIVE = r'C:\Users\Lívia\Documents\GitHub\Apex-Dynamics\mobile\assets\adaptive-icon.png'

logo = Image.open(SRC).convert('RGBA')

# ── icon.png (1024x1024, padding ~12%) ───────────────────────────────
bg = Image.new('RGBA', (SIZE, SIZE), (10, 10, 15, 255))
pad = int(SIZE * 0.12)
max_w = SIZE - pad * 2
max_h = SIZE - pad * 2
logo_r = logo.copy()
logo_r.thumbnail((max_w, max_h), Image.LANCZOS)
lw, lh = logo_r.size
ox = (SIZE - lw) // 2
oy = (SIZE - lh) // 2
bg.paste(logo_r, (ox, oy), logo_r)
out = bg.convert('RGB')
out.save(DST_ICON, 'PNG')
print('OK icon.png saved')

# ── adaptive-icon.png (1024x1024, padding ~18% para Android safe zone) ─
bg2 = Image.new('RGBA', (SIZE, SIZE), (10, 10, 15, 255))
pad2 = int(SIZE * 0.18)
max_w2 = SIZE - pad2 * 2
max_h2 = SIZE - pad2 * 2
logo_r2 = logo.copy()
logo_r2.thumbnail((max_w2, max_h2), Image.LANCZOS)
lw2, lh2 = logo_r2.size
ox2 = (SIZE - lw2) // 2
oy2 = (SIZE - lh2) // 2
bg2.paste(logo_r2, (ox2, oy2), logo_r2)
out2 = bg2.convert('RGB')
out2.save(DST_ADAPTIVE, 'PNG')
print('OK adaptive-icon.png saved')

print('Dimensoes da logo original:', logo.size)
