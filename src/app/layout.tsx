import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "PerfTrace — Performance testing",
  description:
    "Record sessions, capture Web Vitals, and analyze performance with CPU throttling and live metrics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-sans antialiased bg-[var(--bg)] text-[var(--fg)]`}
      >
        {children}
      </body>
    </html>
  );
}
