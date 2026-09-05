import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "错题本",
  description: "拍作业、圈错题、按时复习",
  /* 加到 iOS 桌面后以独立窗口启动，不带 Safari 的地址栏和底部工具条。
   * 这一条必须在根布局上——iOS 是按启动那一页的标签决定的。 */
  appleWebApp: { capable: true, title: "错题本", statusBarStyle: "default" },
  /* Next 只发标准名 mobile-web-app-capable，那是 Safari 17.4（2024-03）
   * 才认的。旧 iPhone 只看 apple- 前缀的老名字，不补这一条，加到桌面后
   * 打开还是带地址栏的 Safari 窗口。 */
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  /* 安卓上状态栏会跟着这个颜色走，装成应用后才不像个网页 */
  themeColor: "#dc2626",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
