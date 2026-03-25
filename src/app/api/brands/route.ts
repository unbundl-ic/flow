import { NextRequest, NextResponse } from 'next/server';
import { BrandData } from '@/lib/filestore';
import { getStore } from '@/lib/store';

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
  const store = getStore();
  const brands = await store.getBrands();
  return NextResponse.json(brands);
}

export async function POST(req: NextRequest) {
  const store = getStore();
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
      while (await store.getBrand(candidate)) {
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

    await store.saveBrand(newBrand);
    return NextResponse.json(newBrand);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
