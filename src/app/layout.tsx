import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Layers, Home } from "lucide-react";
import SubtleBackground from "@/components/ui/subtle-background";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flow Engine | Automation Platform",
  description: "High-performance multi-brand automation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <SubtleBackground />
        
        {/* Global Navbar */}
        <header className="sticky top-0 z-50 w-full border-b bg-white/60 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:rotate-12 transition-transform">
                <Layers className="text-white h-5 w-5" />
              </div>
              <span className="font-black text-xl tracking-tighter text-slate-900">FLOW<span className="text-indigo-600">ENGINE</span></span>
            </Link>
            
            <nav className="flex items-center gap-6">
              <Link href="/" className="text-xs font-black text-slate-500 hover:text-indigo-600 flex items-center gap-2 transition-colors tracking-widest">
                <Home className="h-3 w-3" /> DASHBOARD
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
