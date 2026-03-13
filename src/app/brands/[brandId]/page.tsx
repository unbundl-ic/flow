'use client';

import { useState, useEffect, use } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Pause, Trash2, Edit, Calendar, LayoutGrid, ChevronRight, ArrowLeft } from "lucide-react";
import Link from 'next/link';
import { toast, Toaster } from 'sonner';
import { FlowData, BrandData } from '@/lib/filestore';

export default function BrandPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = use(params);
  const [flows, setFlows] = useState<FlowData[]>([]);
  const [brand, setBrand] = useState<BrandData | null | undefined>(undefined);

  useEffect(() => {
    fetch('/api/brands', { cache: 'no-store' })
      .then(res => res.json())
      .then((data: BrandData[]) => {
        if (Array.isArray(data)) {
          const found = data.find((b: BrandData) => b.id === brandId);
          setBrand(found ?? null);
        } else {
          setBrand(null);
        }
      })
      .catch(() => setBrand(null));
  }, [brandId]);

  useEffect(() => {
    fetch('/api/flows').then(res => res.json()).then(data => {
      if(Array.isArray(data)) {
        setFlows(data.filter((f: FlowData) => f.brandId === brandId));
      }
    });
  }, [brandId]);

  const toggleFlow = async (flow: FlowData) => {
    const updated = { ...flow, schedule: { ...flow.schedule, active: !flow.schedule.active } };
    await fetch(`/api/flows/${flow.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    setFlows(flows.map(f => f.id === flow.id ? updated : f));
    toast.success(`Flow ${updated.schedule.active ? 'Resumed' : 'Paused'}`);
  };

  const deleteFlow = async (id: string) => {
    const res = await fetch(`/api/flows/${id}`, { method: 'DELETE' });
    if(res.ok) {
        setFlows(flows.filter(f => f.id !== id));
        toast.success('Flow deleted');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] p-8">
      <Toaster position="top-right" richColors />
      <div className="max-w-5xl mx-auto space-y-10">
        
        {brand === null && (
          <div className="text-center py-20 bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">Brand not found</h2>
            <p className="text-slate-500">This brand may have been removed or the link is incorrect.</p>
            <Link href="/">
              <Button className="mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        )}

        {brand !== undefined && brand !== null && (
          <>
        {/* Breadcrumbs & Navigation */}
        <nav className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
          <Link href="/" className="hover:text-indigo-600 transition-colors">
            DASHBOARD
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-slate-900">{brand.name}</span>
        </nav>

        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">{brand.name}</h1>
            <p className="text-slate-500 font-medium">{brand.description || 'Manage and monitor automation for this brand.'}</p>
          </div>
          <div className="flex gap-3">
            <Link href="/">
              <Button variant="outline" className="h-12 px-6 rounded-xl font-bold border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                <ArrowLeft className="mr-2 h-4 w-4" /> BACK
              </Button>
            </Link>
            <Link href={`/brands/${brandId}/create`}>
              <Button className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-100 rounded-xl font-bold transition-all active:scale-95">
                <Plus className="mr-2 h-4 w-4" /> NEW FLOW
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-6">
          {flows.map(flow => (
            <Card key={flow.id} className="border-none shadow-sm hover:shadow-xl transition-all duration-300 ring-1 ring-slate-200 rounded-2xl overflow-hidden bg-white group">
              <CardContent className="p-0 flex flex-col md:flex-row md:items-center">
                <div className={`w-2 self-stretch ${flow.schedule.active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-200'}`} />
                <div className="p-6 flex-1 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                    <h3 className="text-xl font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors uppercase italic">{flow.name || 'Untitled Flow'}</h3>
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md text-slate-500 font-black">
                            <Calendar className="h-3 w-3" /> {flow.schedule.type}
                        </span>
                        <span className="flex items-center gap-1.5 font-black opacity-60">
                            LAST RUN: {flow.schedule.lastRun ? new Date(flow.schedule.lastRun).toLocaleString() : 'NEVER'}
                        </span>
                    </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                    <Badge variant={flow.schedule.active ? 'default' : 'secondary'} className={`px-3 py-1 rounded-full text-[10px] font-black ${flow.schedule.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none' : 'bg-slate-100 text-slate-500 hover:bg-slate-100 border-none'}`}>
                        {flow.schedule.active ? 'ACTIVE' : 'PAUSED'}
                    </Badge>
                    
                    <div className="h-10 w-px bg-slate-100 mx-2" />
                    
                    <Button 
                        size="icon" 
                        variant="ghost" 
                        className={`rounded-full h-10 w-10 ${flow.schedule.active ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                        onClick={() => toggleFlow(flow)}
                    >
                        {flow.schedule.active ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                    </Button>

                    <Link href={`/flows/${flow.id}`}>
                        <Button size="icon" variant="ghost" className="rounded-full h-10 w-10 text-indigo-600 hover:bg-indigo-50">
                            <Edit className="h-5 w-5" />
                        </Button>
                    </Link>

                    <Button 
                        size="icon" 
                        variant="ghost" 
                        className="rounded-full h-10 w-10 text-rose-500 hover:bg-rose-50"
                        onClick={() => deleteFlow(flow.id)}
                    >
                        <Trash2 className="h-5 w-5" />
                    </Button>
                    </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {flows.length === 0 && (
            <div className="text-center py-20 bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                <LayoutGrid className="h-8 w-8 text-slate-200" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">No active flows</h3>
                <p className="text-slate-400 text-sm">Create your first automation cycle.</p>
              </div>
              <Link href={`/brands/${brandId}/create`}>
                <Button variant="outline" className="mt-2 rounded-xl border-slate-200 font-bold hover:bg-indigo-50 hover:text-indigo-600">
                    NEW FLOW
                </Button>
              </Link>
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
