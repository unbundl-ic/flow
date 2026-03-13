'use client';

import { useState, use } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, ChevronRight, Home, Loader2, Zap } from "lucide-react";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast, Toaster } from 'sonner';
import { ScheduleType } from '@/lib/filestore';

export default function CreateFlowPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [flow, setFlow] = useState({
    name: '',
    type: 'form-submission' as 'form-submission' | 'collection-scrape',
    isShopify: false,
    url: '',
    brandId: brandId,
    formData: {
      name: 'Abhishek',
      phone: '9898989898',
    },
    schedule: {
      type: 'manual' as ScheduleType,
      active: false
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flow.name) {
      toast.error('Please enter a flow name');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flow)
      });

      if (res.ok) {
        toast.success('Flow created successfully!');
        router.push(`/brands/${brandId}`);
      } else {
        toast.error('Failed to create flow');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <Toaster position="top-right" richColors />
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm font-bold text-slate-400">
          <Link href="/" className="hover:text-indigo-600 flex items-center gap-1 transition-colors text-[10px] uppercase tracking-widest">
            <Home className="h-3.5 w-3.5" /> DASHBOARD
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/brands/${brandId}`} className="hover:text-indigo-600 transition-colors uppercase tracking-widest text-[10px]">
            {brandId.replace('-', ' ')}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-900 tracking-widest text-[10px] uppercase">CREATE NEW</span>
        </nav>

        <div className="flex items-center gap-4">
          <Link href={`/brands/${brandId}`}>
            <Button variant="outline" size="icon" className="rounded-full shadow-sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Create New Flow</h1>
            <p className="text-slate-500 font-medium capitalize text-sm">Targeting {brandId.replace('-', ' ')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-none shadow-xl ring-1 ring-slate-200 rounded-[2rem] overflow-hidden bg-white/80 backdrop-blur-sm">
            <div className="h-2 bg-indigo-600" />
            <CardHeader className="p-8 pb-4">
              <div className="flex justify-between items-center">
                <div>
                    <CardTitle className="text-lg font-black uppercase tracking-tight">Configuration</CardTitle>
                    <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Automation Parameters</CardDescription>
                </div>
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl px-4 border border-slate-100">
                    <Zap className={`h-4 w-4 ${flow.isShopify ? 'text-indigo-600 fill-indigo-600' : 'text-slate-300'}`} />
                    <Label className="text-[10px] font-black uppercase tracking-widest cursor-pointer" htmlFor="shopify-mode">Shopify Engine</Label>
                    <input 
                        type="checkbox" 
                        id="shopify-mode"
                        checked={flow.isShopify}
                        onChange={e => setFlow({...flow, isShopify: e.target.checked})}
                        className="w-4 h-4 rounded-full accent-indigo-600 cursor-pointer"
                    />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Flow Name</Label>
                  <Input 
                    placeholder="e.g., Summer Inventory" 
                    value={flow.name}
                    onChange={e => setFlow({...flow, name: e.target.value})}
                    className="h-14 rounded-2xl bg-slate-50 border-none font-black text-lg focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Automation Type</Label>
                  <Select value={flow.type} onValueChange={(val: any) => setFlow({...flow, type: val})}>
                    <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none font-black text-indigo-600 shadow-inner">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="form-submission">Lead Generation</SelectItem>
                      <SelectItem value="collection-scrape">Inventory Scraper</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Source URL</Label>
                <Input 
                  placeholder="https://..." 
                  value={flow.url}
                  onChange={e => setFlow({...flow, url: e.target.value})}
                  className="h-14 rounded-2xl bg-slate-50 border-none font-mono text-xs focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Repeat Pattern</Label>
                  <Select value={flow.schedule.type} onValueChange={(val: ScheduleType) => setFlow({...flow, schedule: {...flow.schedule, type: val}})}>
                    <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none font-black text-indigo-600 shadow-inner">
                      <SelectValue placeholder="Frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Only</SelectItem>
                      <SelectItem value="hourly">Hourly Interval</SelectItem>
                      <SelectItem value="daily">Daily Cycle</SelectItem>
                      <SelectItem value="weekly">Weekly Cycle</SelectItem>
                      <SelectItem value="monthly">Monthly Cycle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-3 flex flex-col justify-end">
                   <Button 
                    type="button"
                    variant={flow.schedule.active ? "default" : "outline"}
                    className={`h-14 rounded-2xl font-black transition-all border-none shadow-xl ${flow.schedule.active ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                    onClick={() => setFlow({...flow, schedule: {...flow.schedule, active: !flow.schedule.active}})}
                  >
                    {flow.schedule.active ? "SCHEDULER ENABLED" : "SCHEDULER DISABLED"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {flow.type === 'form-submission' && !flow.isShopify && (
            <Card className="border-none shadow-xl ring-1 ring-slate-200 rounded-[2rem] overflow-hidden bg-white/80 backdrop-blur-sm">
              <CardHeader className="p-8 pb-4 bg-slate-50/50">
                <CardTitle className="text-lg font-black uppercase tracking-tight">Form Payloads</CardTitle>
                <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Static Data Injection</CardDescription>
              </CardHeader>
              <CardContent className="p-8 grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Lead Name</Label>
                  <Input value={flow.formData.name} onChange={e => setFlow({...flow, formData: {...flow.formData, name: e.target.value}})} className="h-14 rounded-2xl bg-slate-50 border-none font-black text-lg focus:ring-4 focus:ring-indigo-500/10" />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Lead Phone</Label>
                  <Input value={flow.formData.phone} onChange={e => setFlow({...flow, formData: {...flow.formData, phone: e.target.value}})} className="h-14 rounded-2xl bg-slate-50 border-none font-mono focus:ring-4 focus:ring-indigo-500/10" />
                </div>
              </CardContent>
            </Card>
          )}

          <div className="pt-4 pb-20">
            <Button type="submit" disabled={loading} className="w-full h-20 bg-slate-900 hover:bg-indigo-600 text-white rounded-[2rem] text-xl font-black shadow-2xl shadow-black/10 transition-all active:scale-[0.98] tracking-widest text-center">
              {loading ? <Loader2 className="animate-spin mr-3 h-6 w-6" /> : <Plus className="mr-3 h-6 w-6" />}
              INITIALIZE FLOW
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
