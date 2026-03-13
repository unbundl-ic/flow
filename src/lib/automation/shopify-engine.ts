import { Page, Locator } from 'playwright';
import { 
  inStockKeywords, 
  outOfStockKeywords, 
  interactableSelectors, 
  INVALID_ATTRIBUTE_KEYWORDS 
} from './shopify-constants';

export interface ElementInfo {
  locator: Locator;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tag: string;
  classes: string;
  id: string;
  name: string;
  aria: string;
  role: string;
  dist?: number;
}

export interface VariantOption {
  elementHandle: Locator;
  text: string;
}

export interface VariantGroup {
  groupName: string;
  options: VariantOption[];
}

export class ShopifyEngine {
  
  static generateCombinations(groups: VariantGroup[]): VariantOption[][] {
    if (!groups || groups.length === 0) return [];
    const results: VariantOption[][] = [];

    function recurse(index: number, current: VariantOption[]) {
      if (index === groups.length) {
        results.push(current);
        return;
      }
      for (const option of groups[index].options) {
        recurse(index + 1, [...current, option]);
      }
    }

    recurse(0, []);
    return results;
  }

  static async findPrimaryCTA(page: Page): Promise<Locator | null> {
    const ctaSelectors = [
      'button[name="add"]', '#add-to-cart', '.add-to-cart', 
      '.btn-add-to-cart', 'button.primary-cta', '.pdp-addtobag-btn'
    ];

    for (const selector of ctaSelectors) {
      const btn = page.locator(selector);
      if ((await btn.count()) > 0 && (await btn.first().isVisible())) {
        return btn.first();
      }
    }

    const buttons = page.locator('button, input[type="button"], input[type="submit"], [role="button"]');
    for (let i = 0; i < (await buttons.count()); i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = ((await btn.innerText()) || "").toLowerCase();
        if (inStockKeywords.some(k => text.includes(k)) || outOfStockKeywords.some(k => text.includes(k))) {
          return btn;
        }
      }
    }
    return null;
  }

  static async checkStockState(page: Page): Promise<'inStock' | 'outOfStock'> {
    await page.waitForTimeout(500);
    const cta = await this.findPrimaryCTA(page);
    if (cta) {
      const text = ((await cta.innerText()) || "").toLowerCase();
      if (outOfStockKeywords.some(k => text.includes(k))) return 'outOfStock';
      if (inStockKeywords.some(k => text.includes(k))) return 'inStock';
    }
    const pageText = (await page.content()).toLowerCase();
    if (outOfStockKeywords.some(k => pageText.includes(k))) return 'outOfStock';
    return 'inStock';
  }

  static removeOutliers(cluster: ElementInfo[]): ElementInfo[] {
    if (cluster.length < 2) return cluster;
    if (cluster.length === 2) {
      const d = Math.sqrt(Math.pow(cluster[0].x - cluster[1].x, 2) + Math.pow(cluster[0].y - cluster[1].y, 2));
      return d > 500 ? [] : cluster;
    }

    let currentCluster = [...cluster];
    while (currentCluster.length >= 3) {
      const n = currentCluster.length;
      const sortedX = [...currentCluster].map(el => el.x).sort((a, b) => a - b);
      const medianX = sortedX[Math.floor(n / 2)];
      const sortedY = [...currentCluster].map(el => el.y).sort((a, b) => a - b);
      const medianY = sortedY[Math.floor(n / 2)];

      const clusterWithDist = currentCluster.map(el => ({
        ...el,
        dist: Math.sqrt(Math.pow(el.x - medianX, 2) + Math.pow(el.y - medianY, 2))
      }));

      clusterWithDist.sort((a, b) => (a.dist || 0) - (b.dist || 0));
      const suspect = clusterWithDist[n - 1];
      const range = (suspect.dist || 0) - (clusterWithDist[0].dist || 0);
      if (range === 0) break;

      const qTable: Record<number, number> = { 3: 0.941, 4: 0.765, 5: 0.642, 6: 0.56, 7: 0.507, 8: 0.468, 9: 0.437, 10: 0.412 };
      const Q_CRIT = qTable[n] || 0.4;
      const gap = (suspect.dist || 0) - (clusterWithDist[n - 2].dist || 0);
      if (gap / range > Q_CRIT) {
        currentCluster = currentCluster.filter(el => !(el.x === suspect.x && el.y === suspect.y));
      } else break;
    }
    return currentCluster;
  }

  static async collectViewportElements(page: Page): Promise<Locator[]> {
    const selectorQuery = interactableSelectors.join(",");
    const locator = page.locator(selectorQuery);
    const elements: Locator[] = [];

    for (let i = 0; i < (await locator.count()); i++) {
      const element = locator.nth(i);
      if (!(await element.isVisible())) continue;

      const inViewPort = await element.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth)) return false;
        const excludedTags = ["HEADER", "FOOTER", "NAV"];
        let parent: HTMLElement | null = node as HTMLElement;
        while (parent) {
          if (excludedTags.includes(parent.tagName)) return false;
          parent = parent.parentElement;
        }
        return true;
      });

      if (!inViewPort) continue;
      const text = await element.evaluate(node => ((node as HTMLElement).innerText || "").toLowerCase());
      if (inStockKeywords.some(k => text.includes(k)) || outOfStockKeywords.some(k => text.includes(k))) continue;
      elements.push(element);
    }
    return elements;
  }

  static async extractElementInfo(elements: Locator[]): Promise<ElementInfo[]> {
    const result: ElementInfo[] = [];
    for (const element of elements) {
      const info = await element.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const htmlNode = node as HTMLElement;
        return {
          text: htmlNode.innerText?.trim() || node.getAttribute("aria-label") || node.getAttribute("title") || "",
          x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          tag: node.tagName, classes: node.className, id: node.id || "",
          name: node.getAttribute("name") || "", aria: node.getAttribute("aria-label") || "",
          role: node.getAttribute("role") || ""
        };
      });
      result.push({ locator: element, ...info });
    }
    return result.sort((a, b) => a.y - b.y);
  }

  static clusterElements(elements: ElementInfo[]): ElementInfo[][] {
    if (elements.length === 0) return [];
    const clusters: ElementInfo[][] = [];
    let currentCluster = [elements[0]];

    for (let i = 1; i < elements.length; i++) {
      const current = elements[i];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nearest = currentCluster.reduce((closest: any, el) => {
        const dist = Math.abs(el.x - current.x);
        return (!closest || dist < closest.dist) ? { el, dist } : closest;
      }, null)?.el;

      let shouldJoin = false;
      if (nearest) {
        const yDist = Math.abs(current.y - nearest.y);
        const xDist = Math.abs(current.x - nearest.x);
        shouldJoin = Math.sqrt(xDist ** 2 + yDist ** 2) < 150 && yDist < 70;
      }

      if (shouldJoin) currentCluster.push(current);
      else { clusters.push(currentCluster); currentCluster = [current]; }
    }
    clusters.push(currentCluster);
    return clusters;
  }

  static extractVariantGroups(clusters: ElementInfo[][]): VariantGroup[] {
    const groups: VariantGroup[] = [];
    for (const rawCluster of clusters) {
      const cluster = this.removeOutliers(rawCluster);
      if (cluster.length < 2) continue;

      const counts: Record<string, number> = {};
      cluster.forEach(el => counts[el.tag] = (counts[el.tag] || 0) + 1);
      const majorityTag = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

      const options = cluster.filter(el => {
        const combined = [el.classes, el.id, el.name, el.aria, el.role, el.text].join(" ").toLowerCase();
        if (INVALID_ATTRIBUTE_KEYWORDS.some(word => combined.includes(word))) return false;
        if (el.tag !== majorityTag) return false;
        return !cluster.some(other => other !== el && other.x >= el.x && other.y >= el.y && (other.x + other.width <= el.x + el.width) && (other.y + other.height <= el.y + el.height));
      });

      if (options.length > 1) {
        groups.push({
          groupName: "detected-group",
          options: options.map(el => ({ elementHandle: el.locator, text: el.text }))
        });
      }
    }
    return groups;
  }
}
