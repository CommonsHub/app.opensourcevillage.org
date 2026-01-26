import type { Metadata, Viewport } from "next";
import "./globals.css";
import WalletSetup from "@/components/WalletSetup";
import NostrStatus from "@/components/NostrStatus";
import DebugInfo from "@/components/DebugInfo";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Open Source Village",
  description: "Mobile webapp for Open Source Village event attendees",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 min-h-screen flex flex-col">
        <WalletSetup />
        <NostrStatus />
        <TopBar />
        <DebugInfo />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
