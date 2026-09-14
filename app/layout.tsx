import type { Metadata } from "next";
import { Bagel_Fat_One, Karla } from "next/font/google";
import NavBar from "@/components/NavBar";
import SetupBanner from "@/components/SetupBanner";
import "./globals.css";

/** Display face — spent in exactly two places per screen: the hero number and page titles. */
const displayFont = Bagel_Fat_One({
  variable: "--font-display-raw",
  subsets: ["latin"],
  weight: "400",
});

/** Body/UI face — everything else, including the dense micronutrient list. */
const bodyFont = Karla({
  variable: "--font-body-raw",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Nutrition App",
  description: "Photo-based nutrition tracking",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-butter text-cocoa font-body">
        <NavBar />
        <SetupBanner />
        {children}
      </body>
    </html>
  );
}
