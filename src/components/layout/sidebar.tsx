"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package, ChefHat, Flame, Wine,
  ClipboardList, Grid3X3, Calendar, Users, Truck, ShoppingBag,
  FileText, BarChart3, Settings, LogOut, ChevronLeft,
  Menu, X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { BRAND, NAV_ITEMS } from "@/lib/constants";
import { canAccessRoute } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/layout/notification-bell";
import type { Profile } from "@/types/database";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, ShoppingCart, Package, ChefHat, Flame, Wine,
  ClipboardList, Grid3X3, Calendar, Users, Truck, ShoppingBag,
  FileText, BarChart3, Settings,
};

interface SidebarProps {
  profile: Profile;
  notificationCount?: number;
}

function useSquareScreen() {
  const [isSquare, setIsSquare] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-aspect-ratio: 5/4), (max-height: 820px)");
    const update = () => setIsSquare(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isSquare;
}

export function Sidebar({ profile, notificationCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isSquare = useSquareScreen();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isSquare) setCollapsed(true);
  }, [isSquare]);

  const navItems = NAV_ITEMS.filter((item) => canAccessRoute(profile.role, item.roles));

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const sidebarContent = (
    <>
      <div className={cn("flex items-center gap-3 px-4 py-6 border-b border-smoked-brown/30", collapsed && "justify-center")}>
        {!collapsed && (
          <div>
            <h1 className="font-[family-name:var(--font-cinzel)] text-xl font-bold text-primary tracking-wider">
              {BRAND.name}
            </h1>
            <p className="text-[10px] text-off-white/40 tracking-[0.2em] uppercase">{BRAND.subtitle}</p>
          </div>
        )}
        {collapsed && (
          <span className="font-[family-name:var(--font-cinzel)] text-2xl font-bold text-primary">OS</span>
        )}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-off-white/60 hover:text-off-white hover:bg-charcoal/80",
                collapsed && "justify-center px-2"
              )}
            >
              {Icon && <Icon className="h-5 w-5 shrink-0" />}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-smoked-brown/30 space-y-2">
        {!collapsed && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-off-white truncate">{profile.fullname}</p>
            <p className="text-xs text-off-white/40 capitalize">{profile.role.replace("_", " ")}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-off-white/60 hover:text-red-400 hover:bg-red-500/10 transition-colors",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-charcoal border border-smoked-brown/30"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside className={cn(
        "hidden lg:flex flex-col h-dvh bg-black border-r border-smoked-brown/30 transition-all duration-300 sticky top-0",
        collapsed ? "w-[64px]" : "w-64",
        "square:w-[64px]"
      )}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 z-10 p-1 rounded-full bg-charcoal border border-smoked-brown/40 text-off-white/60 hover:text-primary"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
        {sidebarContent}
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/80 z-40"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              className="lg:hidden fixed left-0 top-0 h-full w-64 bg-black border-r border-smoked-brown/30 z-50 flex flex-col"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-1 text-off-white/60"
              >
                <X className="h-5 w-5" />
              </button>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-smoked-brown/20 px-4 py-3 lg:px-8 lg:py-4 short:py-2 square:px-3">
      <div className="flex items-center justify-between gap-2">
        <div className="pl-12 lg:pl-0 min-w-0">
          <h1 className="font-[family-name:var(--font-cinzel)] text-xl lg:text-2xl font-bold text-off-white truncate short:text-lg">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-off-white/50 mt-0.5 truncate short:hidden square:text-xs">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
