'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ArrowLeft, Loader2 } from "lucide-react";
import Link from 'next/link';
import { toast, Toaster } from 'sonner';

const COLOR_OPTIONS = [
  { value: 'indigo', label: 'Indigo', className: 'bg-indigo-500' },
  { value: 'emerald', label: 'Emerald', className: 'bg-emerald-500' },
  { value: 'amber', label: 'Amber', className: 'bg-amber-500' },
  { value: 'rose', label: 'Rose', className: 'bg-rose-500' },
];

function slugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '') || 'brand';
  return base;
}

export default function CreateBrandPage() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('indigo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const id = slugFromName(trimmedName);
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || undefined,
          color: color || undefined,
          id,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || `Request failed (${res.status})`;
        setError(msg);
        toast.error(msg);
        return;
      }

      const brandId = data?.id ?? id;
      toast.success('Brand created');
      window.location.href = `/brands/${brandId}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] p-8">
      <Toaster position="top-right" richColors />
      <div className="max-w-xl mx-auto space-y-10">
        <nav className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
          <Link href="/" className="hover:text-indigo-600 transition-colors">
            DASHBOARD
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-slate-900">Create brand</span>
        </nav>

        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Create brand</h1>
            <p className="text-slate-500 font-medium">Add a new brand to manage flows and automation.</p>
          </div>
          <Link href="/">
            <Button
              variant="outline"
              className="h-12 px-6 rounded-xl font-bold border-slate-200 text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> BACK
            </Button>
          </Link>
        </div>

        <Card className="border-none shadow-xl ring-1 ring-slate-200 rounded-2xl overflow-hidden bg-white">
          <CardHeader>
            <CardTitle className="text-xl">Brand details</CardTitle>
            <CardDescription>Name is required. Description and color are optional.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Store"
                  className="rounded-xl"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description (optional)"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-3 flex-wrap">
                  {COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setColor(opt.value)}
                      className={`w-10 h-10 rounded-full ${opt.className} ring-2 transition-all cursor-pointer ${
                        color === opt.value ? 'ring-offset-2 ring-slate-900 scale-110' : 'ring-transparent hover:scale-105'
                      }`}
                      title={opt.label}
                    />
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create brand'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

