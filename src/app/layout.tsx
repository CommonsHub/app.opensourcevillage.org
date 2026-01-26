import type { Metadata, Viewport } from "next";
import "./globals.css";
import EnvSetup from "@/components/EnvSetup";
import WalletSetup from "@/components/WalletSetup";
import NostrStatus from "@/components/NostrStatus";
import DebugInfo from "@/components/DebugInfo";
import TopBar from "@/components/TopBar";

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
      <body className="antialiased bg-gray-50">
        <EnvSetup />
        <WalletSetup />
        <NostrStatus />
        <TopBar />
        <DebugInfo />
        {children}
      </body>
    </html>
  );
}
