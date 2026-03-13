import { chromium, Browser, BrowserContext } from 'playwright';

export class BrowserFactory {
  private static browser: Browser | null = null;

  static async getBrowser(headless: boolean = true): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({ 
        headless,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled', // Stealth
          '--start-minimized', // Backup if headed
        ]
      });
    }
    return this.browser;
  }

  static async createContext(headless: boolean = true): Promise<BrowserContext> {
    const browser = await this.getBrowser(headless);
    return await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      deviceScaleFactor: 1, // Ensure consistent screenshots for OCR
    });
  }

  static async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
