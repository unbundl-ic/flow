import { SampleBrandStrategy } from './sample-brand';
import { CloveBrandStrategy } from './clove';
import { OnitsukaTigerBrandStrategy } from './onitsuka';
import { BrandStrategy } from '../automation/types';

export const BrandRegistry: Record<string, BrandStrategy> = {
  'sample-brand': new SampleBrandStrategy(),
  'clove-dental': new CloveBrandStrategy(),
  'onitsuka-tiger': new OnitsukaTigerBrandStrategy(),
};

export function getBrandStrategy(brandId: string): BrandStrategy | undefined {
  return BrandRegistry[brandId];
}
