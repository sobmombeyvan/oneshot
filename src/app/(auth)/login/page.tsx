"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail, Lock, Eye, EyeOff, Users, TabletSmartphone } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getDefaultRoute } from "@/lib/permissions";
import { clearTabletSession, setTabletSession } from "@/lib/tablet";
import { authErrorMessage, MIN_PASSWORD_LENGTH, toAuthPassword } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Minimum ${MIN_PASSWORD_LENGTH} caractères`),
  tableNumber: z.string().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;
type LoginMode = "staff" | "tablet";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("staff");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    if (mode === "tablet") {
      const table = Number(data.tableNumber);
      if (!Number.isFinite(table) || table < 1) {
        toast.error("Indiquez le numéro de table");
        return;
      }
    }

    setLoading(true);
    try {
      const supabase = createClient();
      let { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: toAuthPassword(data.password),
      });

      // Accounts created before short PINs existed still hold the raw password.
      if (error && data.password !== toAuthPassword(data.password)) {
        ({ error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        }));
      }

      if (error) {
        toast.error(authErrorMessage(error, "Email ou mot de passe incorrect"));
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user?.id ?? "")
        .maybeSingle();

      const role = (profile?.role as UserRole | undefined) ?? "cashier";

      if (mode === "tablet" || role === "client") {
        const table = Number(data.tableNumber) || 1;
        setTabletSession(table);
        toast.success(`Tablette table ${table}`);
        router.push(`/menu?table=${table}`);
        router.refresh();
        return;
      }

      clearTabletSession();
      toast.success("Connexion réussie");
      router.push(getDefaultRoute(role));
      router.refresh();
    } catch (err) {
      toast.error(authErrorMessage(err, "Erreur de connexion"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#4A2B1A20_0%,_transparent_60%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 blur-[100px] rounded-full" />

      <div className="w-full max-w-lg relative z-10 animate-fade-in">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="font-[family-name:var(--font-cinzel)] text-3xl sm:text-4xl font-bold text-primary tracking-widest">
            {BRAND.name}
          </h1>
          <p className="text-off-white/60 mt-1 tracking-[0.3em] text-sm uppercase">
            {BRAND.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
          <button
            type="button"
            onClick={() => setMode("staff")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border p-4 sm:p-5 transition-colors min-h-[88px]",
              mode === "staff"
                ? "border-primary bg-primary/15 text-primary"
                : "border-smoked-brown/40 bg-charcoal/40 text-off-white/70"
            )}
          >
            <Users className="h-6 w-6" />
            <span className="text-sm font-medium">Personnel</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("tablet")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border p-4 sm:p-5 transition-colors min-h-[88px]",
              mode === "tablet"
                ? "border-primary bg-primary/15 text-primary"
                : "border-smoked-brown/40 bg-charcoal/40 text-off-white/70"
            )}
          >
            <TabletSmartphone className="h-6 w-6" />
            <span className="text-sm font-medium">Tablette client</span>
          </button>
        </div>

        <Card className="border-smoked-brown/40">
          <CardHeader className="text-center">
            <CardTitle>
              {mode === "staff" ? "Connexion personnel" : "Mode tablette client"}
            </CardTitle>
            <CardDescription>
              {mode === "staff"
                ? "Accédez à la caisse, cuisine et gestion"
                : "Le client voit le menu et envoie la commande à la caisse"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {mode === "tablet" && (
                <div className="space-y-2">
                  <Label htmlFor="tableNumber">Numéro de table</Label>
                  <Input
                    id="tableNumber"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="Ex: 5"
                    className="text-lg h-12"
                    {...register("tableNumber")}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={mode === "tablet" ? "tablette@oneshot.local" : "admin@oneshot.cm"}
                    className="pl-10 h-12"
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <p className="text-red-400 text-xs">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-10 pr-10 h-12"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-off-white/40 hover:text-off-white p-2"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-400 text-xs">{errors.password.message}</p>
                )}
              </div>

              {mode === "staff" && (
                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                    Mot de passe oublié ?
                  </Link>
                </div>
              )}

              <Button type="submit" className="w-full h-12 text-base" size="lg" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === "tablet" ? (
                  "Ouvrir le menu"
                ) : (
                  "Se connecter"
                )}
              </Button>
            </form>

            {mode === "staff" && (
              <p className="text-center text-sm text-off-white/50 mt-6">
                Pas encore de compte ?{" "}
                <Link href="/register" className="text-primary hover:underline">
                  S&apos;inscrire
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
