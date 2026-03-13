import { v4 as uuidv4 } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';
import { FileStore, BrandData } from '@/lib/filestore';

const SEED_BRANDS: Omit<BrandData, 'createdAt' | 'updatedAt'>[] = [
  { id: 'clove-dental', name: 'Clove Dental', description: 'Lead generation and form automation', color: 'indigo' },
  { id: 'onitsuka-tiger', name: 'Onitsuka Tiger', description: 'Product and inventory monitoring', color: 'emerald' },
];

function slugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    || 'brand';
  return base;
}

export async function GET() {
  let brands = await FileStore.getBrands();
  if (brands.length === 0) {
    const now = new Date().toISOString();
    for (const seed of SEED_BRANDS) {
      await FileStore.saveBrand({
        ...seed,
        createdAt: now,
        updatedAt: now,
      });
    }
    brands = await FileStore.getBrands();
  }
  return NextResponse.json(brands);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawName = body.name;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Name is required and must be a non-empty string.' }, { status: 400 });
    }

    let id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      id = slugFromName(name);
      let candidate = id;
      let suffix = 0;
      while (await FileStore.getBrand(candidate)) {
        suffix += 1;
        candidate = `${id}-${suffix}`;
      }
      id = candidate;
    }

    const now = new Date().toISOString();
    const newBrand: BrandData = {
      id,
      name,
      description: typeof body.description === 'string' ? body.description.trim() : '',
      color: body.color || 'indigo',
      createdAt: now,
      updatedAt: now,
    };

    await FileStore.saveBrand(newBrand);
    return NextResponse.json(newBrand);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
