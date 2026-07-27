import type { Metadata } from "next";
import { Cinzel, Montserrat, Bebas_Neue } from "next/font/google";
import { Providers } from "@/providers/providers";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "ONE SHOT Manager — Lounge & Grill",
  description: "Premium Restaurant Management System for ONE SHOT Lounge & Grill",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark h-full">
      <body
        className={`${cinzel.variable} ${montserrat.variable} ${bebasNeue.variable} min-h-full bg-black text-off-white antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
