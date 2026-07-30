"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail, Lock, User, Phone } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/constants";

const registerSchema = z.object({
  fullname: z.string().min(2, "Nom requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().optional(),
  password: z.string().min(8, "Minimum 8 caractères"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { fullname: data.fullname, phone: data.phone },
        emailRedirectTo: `${window.location.origin}/verify-email`,
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Compte créé ! Vérifiez votre email.");
    router.push("/verify-email");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="font-[family-name:var(--font-cinzel)] text-3xl font-bold text-primary">{BRAND.name}</h1>
          <p className="text-off-white/60 text-sm mt-1">Créer un compte</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Inscription</CardTitle>
            <CardDescription>Rejoignez l&apos;équipe ONE SHOT</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Nom complet</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
                  <Input className="pl-10" placeholder="Jean Dupont" {...register("fullname")} />
                </div>
                {errors.fullname && <p className="text-red-400 text-xs">{errors.fullname.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
                  <Input className="pl-10" type="email" placeholder="email@example.com" {...register("email")} />
                </div>
                {errors.email && <p className="text-red-400 text-xs">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Téléphone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
                  <Input className="pl-10" placeholder="+237 6XX XXX XXX" {...register("phone")} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-off-white/40" />
                  <Input className="pl-10" type="password" {...register("password")} />
                </div>
                {errors.password && <p className="text-red-400 text-xs">{errors.password.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Confirmer le mot de passe</Label>
                <Input type="password" {...register("confirmPassword")} />
                {errors.confirmPassword && <p className="text-red-400 text-xs">{errors.confirmPassword.message}</p>}
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer mon compte"}
              </Button>
            </form>

            <p className="text-center text-sm text-off-white/50 mt-6">
              Déjà un compte ?{" "}
              <Link href="/login" className="text-primary hover:underline">Se connecter</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
