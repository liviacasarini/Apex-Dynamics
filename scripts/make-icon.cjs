/**
 * make-icon.cjs — Gera icon.ico a partir de Logo_Desktop.jpeg
 * Remove o fundo escuro, centraliza num quadrado transparente
 * e gera um ICO multi-tamanho: 16, 32, 48, 64, 128, 256 px
 */
const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const ROOT     = path.resolve(__dirname, '..');
const SRC_JPEG = path.join(ROOT, 'public', 'Logo_Desktop.jpeg');
const OUT_ICO  = path.join(ROOT, 'public', 'icon.ico');

const SIZES = [16, 32, 48, 64, 128, 256];
const BG    = { r: 0, g: 0, b: 0, alpha: 0 }; // fundo transparente

/**
 * Remove o fundo escuro do JPEG: pixels com R,G,B abaixo do threshold
 * viram transparentes. Retorna buffer PNG com canal alpha.
 */
async function removeDarkBackground(jpegPath, threshold = 45) {
  const { data, info } = await sharp(jpegPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const buf = Buffer.from(data);

  for (let i = 0; i < buf.length; i += channels) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    if (r < threshold && g < threshold && b < threshold) {
      buf[i + 3] = 0; // transparente
    }
  }

  return sharp(buf, { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

async function pngToIcoBuffer(pngBuf) {
  // ICO: ICONDIR (6) + N * ICONDIRENTRY (16) + image data
  const HEADER = 6;
  const ENTRY  = 16;
  const n      = SIZES.length;
  const images = [];

  for (const size of SIZES) {
    const buf = await sharp(pngBuf)
      .resize(size, size, { fit: 'contain', background: BG })
      .png()
      .toBuffer();
    images.push(buf);
  }

  const totalImgSize = images.reduce((s, b) => s + b.length, 0);
  const out = Buffer.alloc(HEADER + ENTRY * n + totalImgSize);

  // ICONDIR
  out.writeUInt16LE(0, 0); // reserved
  out.writeUInt16LE(1, 2); // type: ICO
  out.writeUInt16LE(n, 4); // count

  let imgOffset = HEADER + ENTRY * n;
  images.forEach((img, i) => {
    const size = SIZES[i];
    const off  = HEADER + ENTRY * i;
    out.writeUInt8(size === 256 ? 0 : size, off);      // width  (0 = 256)
    out.writeUInt8(size === 256 ? 0 : size, off + 1);  // height (0 = 256)
    out.writeUInt8(0,  off + 2);  // color count
    out.writeUInt8(0,  off + 3);  // reserved
    out.writeUInt16LE(1,  off + 4);  // planes
    out.writeUInt16LE(32, off + 6);  // bit count
    out.writeUInt32LE(img.length, off + 8);  // size
    out.writeUInt32LE(imgOffset,  off + 12); // offset
    img.copy(out, imgOffset);
    imgOffset += img.length;
  });

  return out;
}

(async () => {
  console.log('▶ Removendo fundo escuro de Logo_Desktop.jpeg...');
  const pngBuf = await removeDarkBackground(SRC_JPEG);
  console.log('  ✓ Fundo removido.');

  console.log('▶ Gerando icon.ico...');
  const ico = await pngToIcoBuffer(pngBuf);
  fs.writeFileSync(OUT_ICO, ico);
  console.log(`  ✓ icon.ico gerado com tamanhos: ${SIZES.join(', ')} px`);
})();
