import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Scholar's Kingdom — Learn. Grow. Rule.",
  description:
    "Study your school syllabus with AI tutors, earn Kingdom Coins, and claim real square metres of territory on a shared world map. For Grades 6–12, every curriculum worldwide.",
  keywords: [
    "Scholar's Kingdom",
    "AI tutor",
    "gamified learning",
    "Kingdom Coins",
    "world map",
    "grades 6-12",
    "CBSE",
    "IGCSE",
    "IB",
    "GCSE",
    "Common Core",
  ],
};

export const viewport: Viewport = {
  themeColor: "#ece1cd",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${baloo.variable} ${nunito.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
