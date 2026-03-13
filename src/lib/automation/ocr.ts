import Tesseract from 'tesseract.js';
import Jimp from 'jimp';
import fs from 'fs/promises';
import path from 'path';

/**
 * Advanced OCR logic for parsing numeric captchas.
 * Returns both the code and the confidence score.
 */
export async function solveCaptcha(imageBuffer: Buffer): Promise<{ code: string; confidence: number }> {
  try {
    const image = await Jimp.read(imageBuffer);
    
    // 1. Advanced Denoising & Isolate Black Text
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
      const red = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];
      const avg = (red + green + blue) / 3;
      if (avg > 110) {
        this.bitmap.data[idx + 0] = 255;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 255;
      } else {
        this.bitmap.data[idx + 0] = 0;
        this.bitmap.data[idx + 1] = 0;
        this.bitmap.data[idx + 2] = 0;
      }
    });

    // 2. Further Enhancements
    image.grayscale().contrast(1).scale(4);
    
    const processedBuffer = await image.getBufferAsync(Jimp.MIME_PNG);

    // Save for debug visibility
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'last_captcha_proc.png'), processedBuffer);

    console.log('[OCR] Processing cleaned image...');
    
    // 3. Multi-PSM Strategy
    const result = await Tesseract.recognize(
      processedBuffer,
      'eng',
      {
        // @ts-ignore
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '7', 
      }
    );

    let code = result.data.text.replace(/\D/g, '').trim();
    let confidence = result.data.confidence;
    
    console.log(`[OCR-CONSOLE] Value: "${code}" | Confidence: ${confidence}% (PSM 7)`);

    // If confidence is low or code is too short, try PSM 8
    if ((!code || code.length < 4) && confidence < 50) {
      console.log('[OCR] Low confidence, retrying with PSM 8...');
      const result2 = await Tesseract.recognize(
        processedBuffer,
        'eng',
        {
          // @ts-ignore
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: '8',
        }
      );
      const code2 = result2.data.text.replace(/\D/g, '').trim();
      if (code2.length >= code.length) {
        code = code2;
        confidence = result2.data.confidence;
        console.log(`[OCR-CONSOLE] Refined Value: "${code}" | Confidence: ${confidence}% (PSM 8)`);
      }
    }
    
    return { code, confidence };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[OCR-CRITICAL] Parsing failed:', msg);
    return { code: '', confidence: 0 };
  }
}
