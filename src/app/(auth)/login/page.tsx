"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/constants";

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Minimum 6 caractères"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
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
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Connexion réussie");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#4A2B1A20_0%,_transparent_60%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 blur-[100px] rounded-full" />

      {/* CSS animation, not Framer Motion: a JS-driven `initial={{opacity:0}}`
          is written into the server HTML, so the whole form stayed invisible on
          any browser where the bundle fails to run. */}
      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="font-[family-name:var(--font-cinzel)] text-4xl font-bold text-primary tracking-widest">
            {BRAND.name}
          </h1>
          <p className="text-off-white/60 mt-1 tracking-[0.3em] text-sm uppercase">
            {BRAND.subtitle}
          </p>
        </div>

        <Card className="border-smoked-brown/40">
          <CardHeader className="text-center">
            <CardTitle>Connexion</CardTitle>
            <CardDescription>Accédez à votre espace de gestion</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@oneshot.cm"
                    className="pl-10"
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
                    className="pl-10 pr-10"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-off-white/40 hover:text-off-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-400 text-xs">{errors.password.message}</p>
                )}
              </div>

              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Mot de passe oublié ?
                </Link>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}
              </Button>
            </form>

            <p className="text-center text-sm text-off-white/50 mt-6">
              Pas encore de compte ?{" "}
              <Link href="/register" className="text-primary hover:underline">
                S&apos;inscrire
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
