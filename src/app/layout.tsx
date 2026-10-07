import type { Metadata } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme/theme-script";

export const metadata: Metadata = {
  title: "SKMG-HR",
  description: "Human Resource Management System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
