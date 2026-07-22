import { readFileSync, writeFileSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';
import path from 'path';

try {
  const svgPath = path.join(process.cwd(), 'public', 'og-image.svg');
  const pngPath = path.join(process.cwd(), 'public', 'og-image.png');
  
  const svg = readFileSync(svgPath);
  const resvg = new Resvg(svg, {
    background: 'rgba(0,0,0,1)',
    fitTo: {
      mode: 'width',
      value: 1200
    },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'sans-serif'
    }
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  writeFileSync(pngPath, pngBuffer);
  console.log('PNG generated successfully at public/og-image.png');
} catch (error) {
  console.error('Failed to generate OG image:', error);
}
