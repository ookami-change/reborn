"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { apiUrl } from "@/lib/paths";
import { detectEnv, type Env } from "@/lib/claim";

/* 「加到手机桌面」的引导。
 *
 * 三个平台三套完全不同的操作，而且家长十有八九是在**微信里**点开的链接——
 * 微信内置浏览器根本没有"添加到主屏幕"，必须先跳到系统浏览器。这一步不说清楚，
 * 后面全白搭，所以它排在最前面。
 */

/** Chrome 的安装事件，TS 的标准 lib 里没有它的类型 */
type InstallPrompt = Event & { prompt: () => Promise<void> };

/* 环境和当前地址都是「读一次就定了」的外部值，不会再变，所以不需要订阅。
 * 用 useSyncExternalStore 而不是 useEffect + setState：后者会在 hydration
 * 之后多跑一轮渲染，也过不了 react-hooks/set-state-in-effect 这条 lint。
 * 服务端快照返回占位值，避免 hydration 前后 HTML 对不上。 */
const noSubscribe = () => () => {};

export default function SetupGuide({ token, joinHref }: { token: string; joinHref: string }) {
  const env = useSyncExternalStore<Env | "loading">(
    noSubscribe,
    () => detectEnv(navigator),
    () => "loading",
  );
  // 保存的应该是这一页，不是 /join：换手机后打开它才能在新手机上再装一次
  const myLink = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin + apiUrl(`/setup/${token}`),
    () => "",
  );
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // 拦下来，等家长点我们自己的按钮再弹
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    /* 注册一个空的 service worker。它不做任何缓存——错题数据必须实时，
     * 缓存只会带来"改了没生效"这类难查的问题。存在的唯一理由是 Chrome 的
     * 可安装判定要求有一个注册了 fetch 事件的 sw，否则安卓上加到桌面的
     * 只是个书签快捷方式，而不是真正的独立窗口应用。 */
    navigator.serviceWorker
      ?.register(apiUrl("/sw.js"), { scope: apiUrl("/") || "/" })
      .catch(() => {});

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(myLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板被拒（旧浏览器 / 非安全上下文）时退化成选中，让家长自己长按复制
      inputRef.current?.select();
    }
  };

  return (
    <>
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">加到手机桌面</h2>

        {env === "loading" && <p className="mt-2 h-4" />}

        {(env === "wechat-ios" || env === "wechat-other") && (
          <>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              微信里加不了，先跳出去：点右上角 <b>···</b> →{" "}
              <b>{env === "wechat-ios" ? "在Safari中打开" : "在浏览器打开"}</b>，然后回到这一页继续。
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              没看到这个选项就复制下面的链接，粘到浏览器地址栏里打开。
            </p>
          </>
        )}

        {env === "ios" && (
          <Steps
            items={[
              <>
                点屏幕<b>底部中间</b>的分享按钮（一个方框，里面一个向上的箭头）
              </>,
              <>
                在菜单里往下翻，选<b>「添加到主屏幕」</b>
              </>,
              <>
                右上角<b>「添加」</b>
              </>,
            ]}
          />
        )}

        {env === "android" && (
          <>
            {prompt ? (
              <button
                onClick={async () => {
                  await prompt.prompt();
                  setPrompt(null);
                }}
                className="mt-2.5 w-full rounded-xl border border-red-600 py-3 text-sm font-semibold text-red-600"
              >
                一键添加到桌面
              </button>
            ) : (
              <Steps
                items={[
                  <>
                    点右上角的<b>菜单按钮</b>（三个竖着的点，有的手机是三条横线）
                  </>,
                  <>
                    选<b>「添加到主屏幕」</b>或<b>「安装应用」</b>
                  </>,
                  <>确认</>,
                ]}
              />
            )}
          </>
        )}

        {env === "desktop" && (
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            这一步在手机上做。用手机打开下面的链接。
          </p>
        )}
      </section>

      {/* 放在桌面引导下面而不是最上面：摆在最上面家长会直接点进去，
          就再也不会回来装了。装完从桌面图标进，这个按钮其实用不上。 */}
      <a
        href={joinHref}
        className="rounded-xl border border-neutral-300 py-3 text-center text-sm dark:border-neutral-700"
      >
        先直接进去看看
      </a>

      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">你的专属链接</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          换手机、清了浏览器数据之后要靠它找回你的错题。
          <b>别转发给别人</b>——拿到它就等于拿到你家的数据。
        </p>
        <input
          ref={inputRef}
          readOnly
          value={myLink}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2.5 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900"
        />
        <button
          onClick={copy}
          className="mt-2 w-full rounded-xl border border-neutral-300 py-2.5 text-sm dark:border-neutral-700"
        >
          {copied ? "已复制" : "复制链接"}
        </button>
      </section>
    </>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mt-2 space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          <span className="shrink-0 text-neutral-400">{i + 1}.</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}
