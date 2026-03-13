'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Plus, Loader2 } from "lucide-react";
import Link from 'next/link';
import { FlowData, BrandData } from '@/lib/filestore';

export default function Home() {
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, { active: number, paused: number }>>({});

  useEffect(() => {
    fetch('/api/scheduler', { method: 'POST' }).catch(() => {});
    fetch('/api/flows')
      .then(res => res.json())
      .then((flows: FlowData[]) => {
        if (Array.isArray(flows)) {
          const newStats: Record<string, { active: number, paused: number }> = {};
          flows.forEach(f => {
            if (!newStats[f.brandId]) newStats[f.brandId] = { active: 0, paused: 0 };
            if (f.schedule.active) newStats[f.brandId].active++;
            else newStats[f.brandId].paused++;
          });
          setStats(newStats);
        }
      })
      .catch(() => {});

    fetch('/api/brands', { cache: 'no-store' })
      .then(res => res.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setBrands(data as BrandData[]);
        } else {
          setBrands([]);
        }
      })
      .catch(() => {
        setBrands([]);
      })
      .finally(() => {
        setBrandsLoading(false);
      });
  }, []);

  return (
    <div className="relative min-h-full py-12 px-8">
      <div className="relative z-10 max-w-7xl mx-auto space-y-16">
        
        {/* Brand Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-8">
          {brandsLoading ? (
            <div className="col-span-full flex items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {brands.map((brand, index) => {
                const activeCount = stats[brand.id]?.active || 0;

                return (
                  <motion.div
                    key={brand.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="group relative border-none shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 bg-white/40 backdrop-blur-md ring-1 ring-slate-200/50 rounded-[2.5rem] overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                      <CardHeader className="p-8 pb-4">
                        <div className="flex justify-between items-start mb-6">
                          <div className={`w-3 h-3 rounded-full ${activeCount ? 'bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} />
                          {activeCount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black tracking-widest border border-emerald-100">
                              {activeCount} ACTIVE
                            </div>
                          )}
                        </div>
                        <CardTitle className="text-2xl font-black text-slate-800 tracking-tight">{brand.name}</CardTitle>
                        <CardDescription className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">
                          {brand.description}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="p-8 pt-4">
                        <div className="flex items-center gap-6 mb-8 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                          <span className="flex items-center gap-2">
                            {activeCount} Running
                          </span>
                          <span className="flex items-center gap-2">
                            {stats[brand.id]?.paused || 0} Paused
                          </span>
                        </div>

                        <Link href={`/brands/${brand.id}`} className="block">
                          <Button className="w-full bg-slate-900 text-white hover:bg-indigo-600 font-black tracking-widest transition-all h-14 rounded-2xl shadow-lg shadow-black/5 active:scale-95 text-xs cursor-pointer">
                            OPEN <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}

              {/* Create brand card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: brands.length * 0.1 }}
              >
                <Link href="/brands/new" className="block h-full">
                  <Card className="group relative border-none shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 bg-white/40 backdrop-blur-md ring-1 ring-slate-200/50 rounded-[2.5rem] overflow-hidden border-2 border-dashed border-slate-200 hover:border-indigo-300 h-full min-h-[280px] flex flex-col justify-center cursor-pointer">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <CardContent className="p-8 flex flex-col items-center justify-center gap-4 text-center">
                      <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                        <Plus className="h-8 w-8 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-700 tracking-tight">Add brand</p>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Create a new brand</p>
                      </div>
                      <Button className="w-full bg-slate-900 text-white hover:bg-indigo-600 font-black tracking-widest transition-all h-12 rounded-2xl shadow-lg active:scale-95 text-xs cursor-pointer">
                        CREATE BRAND
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            </>
          )}
        </div>

        {!brandsLoading && brands.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500 font-medium mb-4">No brands yet. Create your first one.</p>
            <Link href="/brands/new">
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-6 cursor-pointer">
                <Plus className="mr-2 h-4 w-4" /> Create brand
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
